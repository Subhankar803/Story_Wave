"""Story Wave Soundscape integration service.
Coordinates emotional atmosphere generation via story-wave-soundscape service.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import time
import types
from pathlib import Path
from typing import Any, Optional

from app.core.logging import logger

# Register story-wave-soundscape/app as 'soundscape_app' package alias to avoid namespace collision with backend/app
_soundscape_pkg_dir = Path(__file__).resolve().parent.parent.parent / "story-wave-soundscape" / "app"
if _soundscape_pkg_dir.exists() and "soundscape_app" not in sys.modules:
    _pkg = types.ModuleType("soundscape_app")
    _pkg.__path__ = [str(_soundscape_pkg_dir)]
    _pkg.__package__ = "soundscape_app"
    sys.modules["soundscape_app"] = _pkg

_service_instance = None


def get_soundscape_service():
    """Lazily initialize and return the singleton soundscape service instance."""
    global _service_instance
    if _service_instance is not None:
        return _service_instance

    try:
        from soundscape_app.config import Settings
        from soundscape_app.service import build_service

        # Detect GPU availability or default to dev_fake for instantaneous local generation
        has_cuda = False
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except Exception:
            has_cuda = False

        force_fake = os.environ.get("DEV_FAKE", "1" if not has_cuda else "0")
        is_dev_fake = str(force_fake).strip().lower() in {"1", "true", "yes", "on"}

        data_dir = os.path.join(tempfile.gettempdir(), "sw_soundscape_data")
        os.makedirs(os.path.join(data_dir, "out"), exist_ok=True)
        os.makedirs(os.path.join(data_dir, "cache"), exist_ok=True)

        settings = Settings(
            dev_fake=is_dev_fake,
            gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
            gemini_model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
            data_dir=data_dir,
            max_pending=20,
            job_ttl_seconds=3600,
        )

        _service_instance = build_service(settings)
        _service_instance.start()
        logger.info(f"Soundscape service started (dev_fake={is_dev_fake}, data_dir={data_dir})")
        return _service_instance
    except Exception as e:
        logger.warning(f"Could not initialize story-wave-soundscape service: {e}")
        return None


def infer_environment(context: str = "", situation: str = "") -> str:
    """Infer scene environment and acoustic atmosphere from context and dialogue situation."""
    combined = f"{situation} {context}".lower()

    if any(w in combined for w in ("river", "rapids", "ferry", "dock", "water", "ghat", "harbor")):
        return "misty riverbank along turbulent water with distant boat movement"
    if any(w in combined for w in ("rain", "storm", "thunder", "monsoon", "downpour")):
        return "steady rain falling on stone and water, damp atmospheric patter"
    if any(w in combined for w in ("market", "crowd", "bazaar", "street", "vendor", "fish")):
        return "busy outdoor marketplace with distant crowd murmur"
    if any(w in combined for w in ("forest", "woods", "trees", "pines", "wraith", "darkness")):
        return "deep night forest with rustling leaves and distant eerie wind"
    if any(w in combined for w in ("sanctum", "citadel", "temple", "vault", "pillars", "hall")):
        return "vast ancient stone sanctum with subtle resonant room reverberation"
    if any(w in combined for w in ("station", "train", "platform", "railway")):
        return "distant railway station ambiance with rhythmic metal hum"
    if any(w in combined for w in ("cafe", "café", "restaurant", "table")):
        return "subtle indoor cafe ambience with gentle muffled clatter"
    if any(w in combined for w in ("room", "apartment", "house", "bedroom", "study")):
        return "quiet dimly lit room with faint ticking clock and low room tone"

    return "atmospheric cinematic setting with grounded low-frequency room tone"


def compute_soundscape_volume(emotion: str = "calm", intensity: int = 5) -> float:
    """Compute dynamic background sound volume: at least 50% (0.50), scaling with intensity & emotion."""
    e = (emotion or "").lower()
    if any(w in e for w in ("fear", "anxi", "panic", "ang", "rage", "defian", "fury", "fight", "joy", "danger", "urgent")):
        boost = 0.08
    elif any(w in e for w in ("sad", "grief", "sorrow", "alone", "quiet", "mourn")):
        boost = -0.02
    else:
        boost = 0.03

    k = max(1, min(10, int(intensity))) / 10.0
    vol = 0.50 + k * 0.25 + boost
    return round(min(0.85, max(0.50, vol)), 2)


def generate_soundscape_audio(
    environment: str | None = None,
    emotion: str = "calm",
    intensity: int = 5,
    dialogue: str = "",
    duration_seconds: float = 6.0,
    context: str = "",
    situation: str = "",
    timeout: float = 6.0,
) -> Optional[dict[str, Any]]:
    """Generate ambient background soundscape audio layer for dialogue.
    Returns dict with audio_url, volume, and plan, or None if unavailable (FR-9).
    """
    service = get_soundscape_service()
    if not service:
        return None

    env = (environment or "").strip() or infer_environment(context=context, situation=situation)
    duration = max(2.0, min(60.0, float(duration_seconds)))

    try:
        from soundscape_app.service import JobRequest

        job_req = JobRequest(
            environment=env,
            emotion=emotion,
            intensity=max(1, min(10, int(intensity))),
            dialogue=dialogue[:400],
            duration_seconds=duration,
            fade=True,
        )

        job = service.submit(job_req)
        start_t = time.time()

        # Wait for generation to finish or timeout
        while job.status in ("planning", "queued", "running") and (time.time() - start_t) < timeout:
            time.sleep(0.05)

        if job.status == "done" and job.audio_path and os.path.exists(job.audio_path):
            filename = f"soundscape_{job.id[:12]}.wav"
            temp_dest = os.path.join(tempfile.gettempdir(), filename)
            try:
                shutil.copyfile(job.audio_path, temp_dest)
            except Exception:
                temp_dest = job.audio_path

            vol = compute_soundscape_volume(emotion=emotion, intensity=intensity)
            plan_dict = {}
            if job.plan:
                plan_dict = job.plan.model_dump() if hasattr(job.plan, "model_dump") else {}
                plan_dict["volume"] = vol

            return {
                "soundscape_url": f"/audio/{filename}",
                "soundscape_volume": vol,
                "soundscape_plan": plan_dict,
                "audio_path": temp_dest,
            }
        else:
            logger.info(f"Soundscape job ended with status '{job.status}' (timeout or failed)")
            return None
    except Exception as e:
        logger.warning(f"Soundscape generation bypassed due to error: {e}")
        return None
