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
    """Procedural multi-environment ambient sound generator.
    Produces crisp, authentic acoustic textures (river/water, rain, wind, room clock, crowd)
    that loop cleanly without requiring an external GPU.
    """

    sample_rate = 48000

    def __init__(self, settings: Settings):
        self.s = settings

    def load(self) -> None:
        pass

    def generate(self, prompt: str, seed: int = 0) -> np.ndarray:
        prompt_lower = (prompt or "").lower()
        digest = hashlib.sha256(f"{prompt}|{seed}".encode()).digest()
        rng = np.random.default_rng(int.from_bytes(digest[:8], "little"))
        sr = self.sample_rate
        total_seconds = self.s.clip_seconds
        n = sr * total_seconds
        t = np.linspace(0.0, total_seconds, n, endpoint=False, dtype=np.float32)

        # 1. WATER / RIVER / RAPIDS / HARBOR / LAKE
        if any(w in prompt_lower for w in ("river", "rapids", "water", "dock", "ferry", "harbor", "stream", "flow", "lake", "ocean", "sea")):
            wave1 = 0.5 + 0.5 * np.sin(2.0 * np.pi * 0.28 * t + 0.5)
            wave2 = 0.5 + 0.5 * np.sin(2.0 * np.pi * 0.16 * t + 1.8)
            raw = rng.standard_normal(n).astype(np.float32)
            fluid_flow = np.cumsum(raw)
            fluid_flow -= np.linspace(fluid_flow[0], fluid_flow[-1], n, dtype=np.float32)
            fluid_flow /= max(float(np.abs(fluid_flow).max()), 1e-6)
            ripples = rng.standard_normal(n).astype(np.float32)
            mod_ripples = ripples * (0.35 * wave1 + 0.25 * wave2 + 0.15)
            rumble = np.sin(2.0 * np.pi * 75.0 * t) * 0.08 * wave1
            audio = 0.55 * fluid_flow * (0.6 + 0.4 * wave1) + 0.40 * mod_ripples + rumble

        # 2. RAIN / STORM / MONSOON / PATTER
        elif any(w in prompt_lower for w in ("rain", "storm", "monsoon", "thunder", "patter", "downpour", "damp")):
            rain_bed = rng.standard_normal(n).astype(np.float32)
            rain_hiss = np.diff(np.pad(rain_bed, (1, 0), mode='edge')).astype(np.float32)
            rain_hiss /= max(float(np.abs(rain_hiss).max()), 1e-6)
            num_drops = int(total_seconds * 35)
            drop_times = rng.integers(0, max(1, n - 2000), size=num_drops)
            droplets = np.zeros(n, dtype=np.float32)
            for dt in drop_times:
                drop_len = min(1500, n - dt)
                freq = rng.uniform(1600.0, 3600.0)
                decay = np.exp(-np.linspace(0.0, 7.0, drop_len, dtype=np.float32))
                ping = np.sin(2.0 * np.pi * freq * np.linspace(0.0, drop_len / sr, drop_len, dtype=np.float32)) * decay
                droplets[dt:dt + drop_len] += ping * rng.uniform(0.3, 0.9)
            droplets /= max(float(np.abs(droplets).max()), 1e-6)
            thunder = np.sin(2.0 * np.pi * 48.0 * t) * (0.5 + 0.5 * np.sin(2.0 * np.pi * 0.1 * t)) * 0.15
            audio = 0.50 * rain_hiss + 0.45 * droplets + thunder

        # 3. WIND / FOREST / WOODS / NIGHT / EERIE
        elif any(w in prompt_lower for w in ("wind", "forest", "woods", "trees", "leaves", "night", "breeze", "whisper", "eerie")):
            gust = 0.5 + 0.5 * np.sin(2.0 * np.pi * 0.22 * t) * (0.8 + 0.2 * np.sin(2.0 * np.pi * 0.08 * t + 1.0))
            wind_noise = np.cumsum(rng.standard_normal(n).astype(np.float32))
            wind_noise -= np.linspace(wind_noise[0], wind_noise[-1], n, dtype=np.float32)
            wind_noise /= max(float(np.abs(wind_noise).max()), 1e-6)
            whistle = np.sin(2.0 * np.pi * (240.0 + 90.0 * gust) * t) * 0.12 * gust
            leaves = rng.standard_normal(n).astype(np.float32) * 0.18 * gust
            audio = 0.60 * wind_noise * (0.4 + 0.6 * gust) + whistle + leaves

        # 4. ROOM / CLOCK / DIM / INDOOR / STUDY / APARTMENT
        elif any(w in prompt_lower for w in ("clock", "tick", "room", "apartment", "house", "study", "sanctum", "hall")):
            room_bed = np.cumsum(rng.standard_normal(n).astype(np.float32))
            room_bed -= np.linspace(room_bed[0], room_bed[-1], n, dtype=np.float32)
            room_bed /= max(float(np.abs(room_bed).max()), 1e-6)
            room_tone = room_bed * 0.35 + np.sin(2.0 * np.pi * 60.0 * t) * 0.05
            ticks = np.zeros(n, dtype=np.float32)
            for sec in range(int(total_seconds)):
                pos = int((sec + 0.5) * sr)
                if pos + 2000 < n:
                    tick_len = 1600
                    freq = 1450.0 if (sec % 2 == 0) else 1150.0
                    decay = np.exp(-np.linspace(0.0, 12.0, tick_len, dtype=np.float32))
                    ping = np.sin(2.0 * np.pi * freq * np.linspace(0.0, tick_len / sr, tick_len, dtype=np.float32)) * decay
                    ticks[pos:pos + tick_len] += ping * 0.85
            audio = room_tone * 0.40 + ticks * 0.60

        # 5. MARKET / STREET / CROWD / BAZAAR
        elif any(w in prompt_lower for w in ("market", "crowd", "street", "bazaar", "cafe", "murmur", "tavern")):
            murmur1 = np.sin(2.0 * np.pi * 320.0 * t) * (0.5 + 0.5 * np.sin(2.0 * np.pi * 1.2 * t))
            murmur2 = np.sin(2.0 * np.pi * 480.0 * t) * (0.5 + 0.5 * np.sin(2.0 * np.pi * 0.8 * t + 1.5))
            chatter_noise = np.cumsum(rng.standard_normal(n).astype(np.float32))
            chatter_noise -= np.linspace(chatter_noise[0], chatter_noise[-1], n, dtype=np.float32)
            chatter_noise /= max(float(np.abs(chatter_noise).max()), 1e-6)
            audio = 0.55 * chatter_noise + 0.25 * murmur1 + 0.20 * murmur2

        # 6. DEFAULT CINEMATIC / ATMOSPHERIC
        else:
            noise = np.cumsum(rng.standard_normal(n).astype(np.float32))
            noise -= np.linspace(noise[0], noise[-1], n, dtype=np.float32)
            noise /= max(float(np.abs(noise).max()), 1e-6)
            swell = 0.70 + 0.30 * np.sin(np.linspace(0, 4 * np.pi, n, dtype=np.float32))
            sub = np.sin(2.0 * np.pi * 65.0 * t) * 0.15
            audio = noise * swell + sub

        # Normalize cleanly to peak 0.85 for audible, crisp presence
        peak = float(np.abs(audio).max())
        if peak > 1e-6:
            audio = (audio / peak) * 0.85
        return audio.astype(np.float32)
