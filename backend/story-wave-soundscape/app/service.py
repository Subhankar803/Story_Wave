"""Job handling. Two stages so a slow Gemini call never blocks the GPU:
   submit -> [plan pool: Gemini, network-bound, 4 threads] -> [GPU worker: ONE thread, one clip at a time]."""
from __future__ import annotations

import hashlib
import os
import queue
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from .audio import apply_fades, loop_to_duration, write_wav
from .config import Settings
from .generator import FakeGenerator, MossGenerator
from .planner import FakeLLM, GeminiLLM, Planner, SoundPlan

PENDING = {"planning", "queued", "running"}


class QueueFull(Exception):
    pass


@dataclass
class JobRequest:
    environment: str
    emotion: str = "calm"
    intensity: int = 5
    dialogue: str = ""
    duration_seconds: float = 4.0
    ambience_prompt: Optional[str] = None  # if given, Gemini is skipped (use for a pre-approved library)
    seed: int = 0
    fade: bool = True


@dataclass
class Job:
    id: str
    request: JobRequest
    status: str = "planning"  # planning -> queued -> running -> done | failed
    plan: Optional[SoundPlan] = None
    error: Optional[str] = None
    audio_path: Optional[str] = None
    cache_hit: bool = False
    created_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None
    timings: dict = field(default_factory=dict)

    def public(self) -> dict:
        return {
            "job_id": self.id,
            "status": self.status,
            "plan": self.plan.model_dump() if self.plan else None,
            "error": self.error,
            "cache_hit": self.cache_hit,
            "timings_seconds": {k: round(v, 2) for k, v in self.timings.items()},
            "audio_url": f"/v1/jobs/{self.id}/audio" if self.status == "done" else None,
        }


class Service:
    def __init__(self, settings: Settings, generator, planner: Planner):
        self.s = settings
        self.generator = generator
        self.planner = planner
        self.jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._gpu_queue: "queue.Queue[Job]" = queue.Queue()
        self._plan_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="plan")
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.model_ready = threading.Event()
        self.model_error: Optional[str] = None

    # ---- lifecycle -------------------------------------------------------
    def start(self) -> None:
        os.makedirs(self.s.cache_dir, exist_ok=True)
        os.makedirs(self.s.output_dir, exist_ok=True)
        self._thread = threading.Thread(target=self._gpu_worker, name="gpu-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._plan_pool.shutdown(wait=False, cancel_futures=True)

    # ---- public API ------------------------------------------------------
    def submit(self, req: JobRequest) -> Job:
        self._purge_old()
        with self._lock:
            pending = sum(1 for j in self.jobs.values() if j.status in PENDING)
            if pending >= self.s.max_pending:
                raise QueueFull()
            job = Job(id=uuid.uuid4().hex, request=req)
            self.jobs[job.id] = job
        self._plan_pool.submit(self._plan_stage, job)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self.jobs.get(job_id)

    def pending_count(self) -> int:
        with self._lock:
            return sum(1 for j in self.jobs.values() if j.status in PENDING)

    # ---- stage 1: plan ---------------------------------------------------
    def _plan_stage(self, job: Job) -> None:
        t0 = time.time()
        try:
            r = job.request
            if r.ambience_prompt:
                job.plan = SoundPlan(ambience_prompt=r.ambience_prompt.strip()[:300], setting=r.environment)
            else:
                job.plan = self.planner.plan(r.environment, r.emotion, r.intensity, r.dialogue)
            job.timings["plan"] = time.time() - t0
            job.status = "queued"
            self._gpu_queue.put(job)
        except Exception as exc:
            self._fail(job, str(exc))

    # ---- stage 2: generate (single thread = single GPU user) ---------------
    def _gpu_worker(self) -> None:
        try:
            self.generator.load()
            self.model_ready.set()
        except Exception as exc:
            self.model_error = f"{type(exc).__name__}: {exc}"
        while not self._stop.is_set():
            try:
                job = self._gpu_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if self.model_error:
                self._fail(job, f"Model failed to load: {self.model_error}")
                continue
            self._run(job)

    def _run(self, job: Job) -> None:
        job.status = "running"
        try:
            r, plan = job.request, job.plan
            t0 = time.time()
            clip, job.cache_hit = self._clip(plan.ambience_prompt, r.seed)
            job.timings["generate"] = time.time() - t0

            sr = self.generator.sample_rate
            wav = loop_to_duration(clip, sr, r.duration_seconds)
            if r.fade:
                wav = apply_fades(wav, sr)
            path = os.path.join(self.s.output_dir, f"{job.id}.wav")
            write_wav(path, wav, sr)
            job.audio_path = path
            job.status = "done"
            job.finished_at = time.time()
        except Exception as exc:
            self._fail(job, f"{type(exc).__name__}: {exc}")

    def _clip(self, prompt: str, seed: int) -> tuple[np.ndarray, bool]:
        key = hashlib.sha256(
            f"{self.s.model_id}|{prompt}|{self.s.clip_seconds}|{self.s.steps}|{self.s.cfg_scale}|{seed}".encode()
        ).hexdigest()[:24]
        path = os.path.join(self.s.cache_dir, f"{key}.npy")
        if os.path.exists(path):
            try:
                return np.load(path), True
            except Exception:
                pass  # corrupted cache entry: regenerate
        clip = self.generator.generate(prompt, seed)
        tmp = f"{path}.{uuid.uuid4().hex}.tmp.npy"
        np.save(tmp, clip)
        os.replace(tmp, path)
        return clip, False

    # ---- helpers ---------------------------------------------------------
    def _fail(self, job: Job, message: str) -> None:
        job.error = message
        job.status = "failed"
        job.finished_at = time.time()

    def _purge_old(self) -> None:
        cutoff = time.time() - self.s.job_ttl_seconds
        with self._lock:
            old = [j for j in self.jobs.values() if j.finished_at and j.finished_at < cutoff]
            for j in old:
                del self.jobs[j.id]
        for j in old:
            if j.audio_path and os.path.exists(j.audio_path):
                try:
                    os.remove(j.audio_path)
                except OSError:
                    pass


def build_service(settings: Settings) -> Service:
    if settings.dev_fake:
        return Service(settings, FakeGenerator(settings), Planner(FakeLLM()))
    llm = GeminiLLM(settings.gemini_api_key, settings.gemini_model) if settings.gemini_api_key else _MissingKey()
    return Service(settings, MossGenerator(settings), Planner(llm))


class _MissingKey:
    def __call__(self, prompt: str) -> str:
        raise RuntimeError("GEMINI_API_KEY is not set. Set it, or pass ambience_prompt in the request.")
