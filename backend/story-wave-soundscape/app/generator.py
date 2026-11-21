"""Sound generators. MossGenerator needs an NVIDIA GPU (16 GB+); FakeGenerator is for dev and tests."""
from __future__ import annotations

import gc
import hashlib
import os

import numpy as np

from .config import Settings


class GeneratorOutOfMemory(RuntimeError):
    pass


class MossGenerator:
    """Settings mirror the notebook variant that sounded best: 4 s latent, 30 steps, cfg 4.0.

    max_inference_seconds MUST match the clip length. Without it the pipeline denoises its full default
    latent and runs out of memory on a 16 GB GPU during the VAE decode."""

    sample_rate = 48000

    def __init__(self, settings: Settings):
        self.s = settings
        self.pipe = None
        self._torch = None

    def load(self) -> None:
        # Must be set before torch is imported.
        os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
        os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")
        os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
        os.environ.setdefault("USE_TF", "0")
        os.environ.setdefault("USE_JAX", "0")
        os.environ.setdefault("USE_FLAX", "0")
        os.environ.setdefault("USE_TORCH", "1")

        import torch
        from moss_soundeffect_v2 import MossSoundEffectPipeline

        if not torch.cuda.is_available():
            raise RuntimeError("No CUDA GPU found. Run with --gpus all, or set DEV_FAKE=1 for local testing.")
        self._torch = torch
        self.pipe = MossSoundEffectPipeline.from_pretrained(
            self.s.model_id, torch_dtype=torch.bfloat16, device="cuda"
        )
        self.sample_rate = int(self.pipe.sample_rate)

    def generate(self, prompt: str, seed: int = 0) -> np.ndarray:
        """Returns mono float32 audio of clip_seconds length."""
        torch = self._torch
        gc.collect()
        torch.cuda.empty_cache()
        try:
            audio = self.pipe(
                prompt=prompt,
                seconds=self.s.clip_seconds,
                num_inference_steps=self.s.steps,
                cfg_scale=self.s.cfg_scale,
                seed=int(seed),
                max_inference_seconds=int(self.s.clip_seconds + 0.999),
            )
            wav = audio[0].float().cpu().numpy()  # (C, T) or (T,)
            del audio
        except torch.cuda.OutOfMemoryError as exc:
            gc.collect()
            torch.cuda.empty_cache()
            raise GeneratorOutOfMemory("GPU ran out of memory while generating") from exc
        finally:
            gc.collect()
            torch.cuda.empty_cache()
        if wav.ndim == 2:
            wav = wav.mean(axis=0)
        return wav.astype(np.float32)


class FakeGenerator:
    """Deterministic brown-ish noise with slow swells. Lets the team test the API without a GPU."""

    sample_rate = 48000

    def __init__(self, settings: Settings):
        self.s = settings

    def load(self) -> None:
        pass

    def generate(self, prompt: str, seed: int = 0) -> np.ndarray:
        digest = hashlib.sha256(f"{prompt}|{seed}".encode()).digest()
        rng = np.random.default_rng(int.from_bytes(digest[:8], "little"))
        n = self.sample_rate * self.s.clip_seconds
        noise = np.cumsum(rng.standard_normal(n)).astype(np.float32)
        noise -= np.linspace(noise[0], noise[-1], n, dtype=np.float32)  # make start and end meet
        noise /= max(float(np.abs(noise).max()), 1e-6)
        swell = 0.75 + 0.25 * np.sin(np.linspace(0, 4 * np.pi, n, dtype=np.float32))
        return (noise * swell * 0.4).astype(np.float32)
