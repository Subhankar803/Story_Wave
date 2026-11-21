"""Turns (environment, emotion, ...) from the upstream model into a sound prompt in the style that worked best
on MOSS-SoundEffect: one main sound + texture + distance."""
from __future__ import annotations

import json
import re
from typing import Callable

from pydantic import BaseModel

VOLUME_MIN, VOLUME_MAX = 0.05, 0.35


class SoundPlan(BaseModel):
    setting: str = ""
    ambience_prompt: str
    mood: str = ""
    volume: float = 0.2  # suggested level when the client mixes this under a voice (0-1)


def build_prompt(environment: str, emotion: str, intensity: int, dialogue: str) -> str:
    return (
        "You are a sound designer for an audio story. Another system has already analysed a line of dialogue "
        "and told you the ENVIRONMENT and EMOTION. Turn them into a BACKGROUND sound design. "
        "ambience_prompt: ONE short, concrete phrase (8 to 16 English words) describing the single main sound "
        "source of the environment, plus its texture and distance. Describe only things you could literally hear, "
        "never feelings or abstract words. Prefer steady, continuous sounds that can loop. No more than two sounds. "
        "Style example: 'steady rain falling on a corrugated metal roof, close, bright continuous patter'. "
        "Use the emotion only to choose texture, distance and loudness (for example sadness: sparse and distant, "
        "tension: close and sharper, joy: warm and lively). "
        "No voices, no singing, no character names, no music, no one-off events like thunder or door slams. "
        "setting: the place in 2 to 4 words. mood: one or two words. "
        "volume: a number from 0.05 to 0.35 (quiet for intimate or sad scenes, higher for loud places or high intensity). "
        "Reply with ONLY one JSON object, no schema, no explanation, no code fences, in exactly this shape: "
        '{"setting": "empty apartment", "ambience_prompt": "quiet room tone with a slow wall clock ticking, close", '
        '"mood": "lonely", "volume": 0.12}'
        f"\n\nENVIRONMENT: {environment}\nEMOTION: {emotion}\nINTENSITY (1-10): {intensity}"
        + (f"\nDIALOGUE (context only):\n{dialogue[:500]}" if dialogue else "")
    )


def parse_plan(text: str) -> SoundPlan:
    """Find the JSON object that has an ambience_prompt, even if the reply has extra text, code fences,
    or a repeated schema (the failure seen in the notebook)."""
    text = re.sub(r"```(?:json)?", "", text or "")
    decoder = json.JSONDecoder()
    found = None
    i = 0
    while i < len(text):
        if text[i] == "{":
            try:
                obj, end = decoder.raw_decode(text, i)
                if isinstance(obj, dict) and obj.get("ambience_prompt"):
                    found = obj  # keep the last matching object
                i = end
                continue
            except json.JSONDecodeError:
                pass
        i += 1
    if found is None:
        raise ValueError("No sound plan found in the model reply: " + text[:300])
    plan = SoundPlan.model_validate(found)
    plan.ambience_prompt = plan.ambience_prompt.strip()[:300]
    plan.volume = min(max(float(plan.volume), VOLUME_MIN), VOLUME_MAX)
    return plan


class GeminiLLM:
    """Callable str -> str. The google-genai import is lazy so dev/test mode does not need it."""

    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set (or set DEV_FAKE=1 for local testing).")
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

    def __call__(self, prompt: str) -> str:
        from google.genai import types

        response = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.4),
        )
        return response.text or ""


class FakeLLM:
    """Dev mode: no network. Echoes the environment back as a plausible prompt."""

    def __call__(self, prompt: str) -> str:
        env = re.search(r"ENVIRONMENT: (.*)", prompt)
        emotion = re.search(r"EMOTION: (.*)", prompt)
        env_text = env.group(1).strip() if env else "room"
        return json.dumps(
            {
                "setting": env_text[:40],
                "ambience_prompt": f"steady ambient sound of {env_text}, close, continuous",
                "mood": emotion.group(1).strip() if emotion else "calm",
                "volume": 0.15,
            }
        )


class Planner:
    def __init__(self, llm: Callable[[str], str], attempts: int = 2):
        self._llm = llm
        self._attempts = attempts

    def plan(self, environment: str, emotion: str, intensity: int, dialogue: str) -> SoundPlan:
        prompt = build_prompt(environment, emotion, intensity, dialogue)
        last_error: Exception | None = None
        for _ in range(self._attempts):
            try:
                return parse_plan(self._llm(prompt))
            except Exception as exc:  # network error, bad JSON, empty reply
                last_error = exc
        raise RuntimeError(f"Planner failed after {self._attempts} attempts: {last_error}")
