"""Audio helpers: loop a short clip to any length, fades, wav writing. numpy only (no ffmpeg needed)."""
from __future__ import annotations

import numpy as np
import soundfile as sf


def loop_to_duration(wav: np.ndarray, sr: int, duration: float, crossfade: float = 1.0) -> np.ndarray:
    """Repeat `wav` until it is `duration` seconds long, joining repeats with an equal-power crossfade
    so the seam is not audible. A shorter target just trims the clip."""
    n_target = int(round(duration * sr))
    wav = np.asarray(wav, dtype=np.float32)
    if n_target <= len(wav):
        return wav[:n_target].copy()

    xf = min(int(crossfade * sr), len(wav) // 4)
    if xf <= 0:  # clip too short to crossfade
        reps = int(np.ceil(n_target / len(wav)))
        return np.tile(wav, reps)[:n_target]

    t = np.linspace(0.0, np.pi / 2, xf, dtype=np.float32)
    fade_out, fade_in = np.cos(t), np.sin(t)
    out = wav.copy()
    while len(out) < n_target:
        out[-xf:] = out[-xf:] * fade_out + wav[:xf] * fade_in
        out = np.concatenate([out, wav[xf:]])
    return out[:n_target]


def apply_fades(wav: np.ndarray, sr: int, fade_in: float = 0.5, fade_out: float = 1.0) -> np.ndarray:
    out = np.asarray(wav, dtype=np.float32).copy()
    n_in = min(int(fade_in * sr), len(out) // 2)
    n_out = min(int(fade_out * sr), len(out) // 2)
    if n_in > 0:
        out[:n_in] *= np.linspace(0.0, 1.0, n_in, dtype=np.float32)
    if n_out > 0:
        out[-n_out:] *= np.linspace(1.0, 0.0, n_out, dtype=np.float32)
    return out


def write_wav(path: str, wav: np.ndarray, sr: int) -> None:
    sf.write(path, np.clip(wav, -1.0, 1.0), sr, subtype="PCM_16")
