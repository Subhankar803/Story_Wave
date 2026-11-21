"""All settings come from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    dev_fake: bool = False            # True: no GPU and no Gemini needed (fake audio, canned plans)
    api_key: str = ""                 # if set, clients must send it as the X-API-Key header
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    model_id: str = "OpenMOSS-Team/MOSS-SoundEffect-v2.0"
    clip_seconds: int = 4             # length of the generated base clip (tuned on a T4)
    steps: int = 30
    cfg_scale: float = 4.0
    data_dir: str = "./data"
    max_pending: int = 20             # queued + running jobs before new ones get HTTP 429
    job_ttl_seconds: int = 3600       # finished jobs and their wav files are removed after this
    max_duration_seconds: float = 120.0

    @property
    def cache_dir(self) -> str:
        return os.path.join(self.data_dir, "cache")

    @property
    def output_dir(self) -> str:
        return os.path.join(self.data_dir, "out")


def load_settings() -> Settings:
    e = os.environ.get
    return Settings(
        dev_fake=_bool(e("DEV_FAKE", "0")),
        api_key=e("API_KEY", ""),
        gemini_api_key=e("GEMINI_API_KEY", ""),
        gemini_model=e("GEMINI_MODEL", "gemini-2.5-flash"),
        model_id=e("MODEL_ID", "OpenMOSS-Team/MOSS-SoundEffect-v2.0"),
        clip_seconds=int(e("CLIP_SECONDS", "4")),
        steps=int(e("STEPS", "30")),
        cfg_scale=float(e("CFG_SCALE", "4.0")),
        data_dir=e("DATA_DIR", "./data"),
        max_pending=int(e("MAX_PENDING", "20")),
        job_ttl_seconds=int(e("JOB_TTL_SECONDS", "3600")),
        max_duration_seconds=float(e("MAX_DURATION_SECONDS", "120")),
    )
