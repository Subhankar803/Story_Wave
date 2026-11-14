"""
Story_Wave_model.py: the AI "model" layer of Story Bible.

Pure functions only: no UI, no saving/loading, no global story state.
The team builds app.py (UI) and save/load on top of this file.

Nothing is trained. Each function sends a structured prompt to the Gemini API
and validates the reply with a Pydantic schema.

Setup:
    pip install google-genai pydantic edge-tts
    set GEMINI_API_KEY=...            (PowerShell: $env:GEMINI_API_KEY="...")

The story bible is a plain list[Fact]. Persist it however you like:
    json.dump([f.model_dump() for f in bible], fp)
    bible = [Fact(**d) for d in json.load(fp)]

Quick check that everything works:   python Story_Wave_model.py
"""
import asyncio
import json
import mimetypes
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------
# Tried in order. If one is overloaded (503) or retired (404) the next is used.
# Gemini model names change often: edit this list from https://aistudio.google.com
MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
]
ATTRS = "location, appearance, age, relationship, possession, ability, world_rule, knowledge, event"

_client = None
_dead_models = set()


def configure(api_key: str | None = None) -> None:
    """Optional. Otherwise the GEMINI_API_KEY environment variable is used."""
    global _client
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("Set GEMINI_API_KEY or call configure(api_key=...).")
    _client = genai.Client(api_key=key)


def _get_client():
    if _client is None:
        configure()
    return _client


def call_llm(contents, temperature: float = 0.0) -> str:
    """Send a prompt (str, or a list with audio parts), return JSON text. Falls back across models."""
    client = _get_client()
    for _ in range(4):
        for model in MODELS:
            if model in _dead_models:
                continue
            try:
                r = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config={"response_mime_type": "application/json", "temperature": temperature},
                )
                return r.text
            except Exception as e:  # noqa: BLE001
                msg = str(e)
                if "404" in msg:
                    _dead_models.add(model)
                print(f"[{model}] failed: {msg[:70]}")
        print("All models busy, waiting 15s...")
        time.sleep(15)
    raise RuntimeError("All models busy. Try again in a few minutes.")


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class Fact(BaseModel):
    entity: str
    attribute: str
    value: str
    chapter: int
    day: str | None = None
    quote: str


class Extraction(BaseModel):
    facts: list[Fact]


class Conflict(BaseModel):
    type: str  # location_time, appearance, world_rule, knowledge, other
    explanation: str
    old_quote: str
    new_quote: str


class Conflicts(BaseModel):
    conflicts: list[Conflict]


class LineEmotion(BaseModel):
    speaker: str
    line: str
    surface_emotion: str
    underlying_emotion: str
    intensity: int  # 1-10
    subtext: str
    voice_match: Literal["consistent", "drifts", "unclear"]
    note: str


class EmotionReport(BaseModel):
    lines: list[LineEmotion]
    arc_summary: str


class VoiceReport(BaseModel):
    transcript: str
    primary_emotion: str
    secondary_emotion: str
    intensity: int  # 1-10
    valence: Literal["negative", "neutral", "positive"]
    energy: Literal["low", "medium", "high"]
    delivery_cues: str
    words_vs_tone_mismatch: bool
    mismatch_note: str
    summary: str


class Branch(BaseModel):
    title: str
    scene: str


class Branches(BaseModel):
    branches: list[Branch]


class BranchResult(BaseModel):
    branch: Branch
    flags: list[Conflict] | None  # None means the continuity check failed
    emotion: EmotionReport | None  # None means the emotion analysis failed


class DialogueOption(BaseModel):
    line: str
    underlying_emotion: str
    intensity: int
    why_in_voice: str


class DialogueOptions(BaseModel):
    options: list[DialogueOption]


def _bible_json(bible: list[Fact]) -> str:
    return json.dumps([f.model_dump() for f in bible])


# --------------------------------------------------------------------------
# 1. Story bible: extract and check
# --------------------------------------------------------------------------
def extract(text: str, chapter: int) -> list[Fact]:
    """Chapter text -> structured facts for the story bible."""
    prompt = (
        "Extract story facts as JSON matching this schema, nothing else: "
        f"{json.dumps(Extraction.model_json_schema())}\n"
        f"Use ONLY these attribute names: {ATTRS}. For location facts the value is just the place name. "
        "Always fill 'day' when a day or time is stated.\n\n"
        f"Chapter {chapter}:\n{text}"
    )
    return Extraction.model_validate_json(call_llm(prompt)).facts


def check(bible: list[Fact], text: str, chapter: int) -> list[Conflict]:
    """New text vs. the bible -> genuine contradictions (empty list if none)."""
    prompt = (
        "You are a strict continuity editor. Below is the established story bible (facts from EARLIER chapters) "
        "and a NEW chapter. Report ONLY genuine contradictions where the new chapter conflicts with a fact in the "
        "bible: impossible travel times, changed physical traits, broken world rules, or a character knowing "
        "something the bible says they were never told. Rules: old_quote must come from the bible and new_quote "
        "from the new chapter, and they must be different passages. Do NOT report a statement that is consistent "
        "with the bible, restates it, or merely says a character does NOT know something. When unsure, do not "
        "report. Return ONLY JSON matching: " + json.dumps(Conflicts.model_json_schema())
        + '\nIf there are none, return {"conflicts": []}.\n\n'
        + "BIBLE:\n" + _bible_json(bible)
        + f"\n\nNEW CHAPTER {chapter}:\n{text}"
    )
    found = Conflicts.model_validate_json(call_llm(prompt)).conflicts
    return [c for c in found if c.old_quote.strip() != c.new_quote.strip()]


def commit_scene(bible: list[Fact], scene_text: str, chapter: int) -> list[Fact]:
    """Return a NEW bible with this scene's facts added (the input list is not changed)."""
    return bible + extract(scene_text, chapter)


def fork_bible(bible: list[Fact]) -> list[Fact]:
    """Multiverse: an independent copy of the bible, so a branch can become its own universe."""
    return [f.model_copy(deep=True) for f in bible]


# --------------------------------------------------------------------------
# 2. Emotion and voice analysis
# --------------------------------------------------------------------------
def analyze_emotion(bible: list[Fact], text: str, chapter: int) -> EmotionReport:
    """Score each line of dialogue: surface vs hidden emotion, intensity, subtext, voice match."""
    prompt = (
        "You are a story editor judging emotional depth and character voice. Using the story bible "
        "(established facts about each character) and the NEW chapter, analyse every line of dialogue. "
        "For each line give the surface emotion, the underlying emotion, intensity 1-10, the subtext, and "
        "whether the voice matches how the bible shows that character (age, background, relationships, how they "
        "spoke before). Use 'drifts' only when the line clearly doesn't fit the character, and say why. "
        "End with a one-sentence emotional arc summary of the chapter. Return ONLY JSON matching: "
        + json.dumps(EmotionReport.model_json_schema())
        + "\n\nBIBLE:\n" + _bible_json(bible)
        + f"\n\nNEW CHAPTER {chapter}:\n{text}"
    )
    return EmotionReport.model_validate_json(call_llm(prompt))


def analyze_voice(audio_path: str) -> VoiceReport:
    """Real human voice (wav/mp3/flac/ogg/aac) -> emotion read from HOW it is said, plus a words-vs-tone check.
    The result is an interpretation, not a measurement. Get the speaker's consent first."""
    mime = mimetypes.guess_type(audio_path)[0] or "audio/wav"
    with open(audio_path, "rb") as fp:
        audio = types.Part.from_bytes(data=fp.read(), mime_type=mime)
    prompt = (
        "Listen to this recording of a person speaking. Judge emotion from HOW it is said (pace, pitch, pauses, "
        "tremor, breathiness, volume), not just the words. Give a transcript, primary and secondary emotion, "
        "intensity 1-10, valence, energy, delivery cues, and whether the tone contradicts the words (e.g. 'I'm fine' "
        "said in a shaky voice), with a note. These are interpretations, so avoid overclaiming. "
        "Return ONLY JSON matching: " + json.dumps(VoiceReport.model_json_schema())
    )
    return VoiceReport.model_validate_json(call_llm([audio, prompt]))


def _prosody(emotion: str, intensity: int) -> tuple[str, str, str]:
    """Map an emotion + intensity to speech rate / pitch / volume offsets for edge-tts."""
    e, k = emotion.lower(), max(1, min(10, intensity)) / 10
    if any(w in e for w in ("grief", "sad", "despair", "sorrow", "helpless", "hurt", "lonely", "melanchol", "resign")):
        rate, pitch, vol = -30 * k, -15 * k, -20 * k
    elif any(w in e for w in ("anger", "angry", "rage", "fury", "frustrat")):
        rate, pitch, vol = 10 * k, 5 * k, 25 * k
    elif any(w in e for w in ("fear", "anxi", "panic", "nervous", "worr")):
        rate, pitch, vol = 20 * k, 15 * k, 0
    elif any(w in e for w in ("joy", "happy", "excite", "cheer", "delight")):
        rate, pitch, vol = 15 * k, 10 * k, 15 * k
    else:
        rate, pitch, vol = 0, 0, 0
    return f"{rate:+.0f}%", f"{pitch:+.0f}Hz", f"{vol:+.0f}%"


def speak(text: str, emotion: str, intensity: int, out_path: str | None = None,
          voice: str = "en-IN-NeerjaNeural") -> str:
    """AI voice: speak text with an emotion and intensity (speed, pitch, volume). Returns an .mp3 path.
    Uses edge-tts (Microsoft online voices, unofficial library, needs internet). Swap this function
    for a better TTS service if richer emotion is needed."""
    import edge_tts

    rate, pitch, vol = _prosody(emotion, int(intensity))
    path = out_path or os.path.join(tempfile.gettempdir(), f"ai_voice_{int(time.time() * 1000)}.mp3")
    # The service sometimes returns "NoAudioReceived" intermittently, so retry and try other voices.
    voices = [voice] + [v for v in ("en-US-AriaNeural", "en-GB-SoniaNeural") if v != voice]
    last_err = None
    for attempt in range(3):
        for v in voices:
            try:
                coro = edge_tts.Communicate(text, v, rate=rate, pitch=pitch, volume=vol).save(path)
                with ThreadPoolExecutor(1) as ex:  # own thread so this also works inside Jupyter / async apps
                    ex.submit(asyncio.run, coro).result()
                return path
            except Exception as e:  # noqa: BLE001
                last_err = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"edge-tts returned no audio after retries: {last_err}")


# --------------------------------------------------------------------------
# 3. Generation
# --------------------------------------------------------------------------
def generate_branches(bible: list[Fact], direction: str, emotion: str, intensity: int,
                      sabotage: bool = False) -> list[Branch]:
    """Write 3 different branching versions of the next scene from the bible.
    sabotage=True makes branch 3 secretly break one fact (DEMO ONLY: shows the checker catching it)."""
    extra = ("\nFor TESTING ONLY: make Branch 3 quietly break exactly one established fact from the bible "
             "(for example a changed trait or a broken world rule), without drawing attention to it."
             if sabotage else "")
    prompt = (
        "You are a co-writer. Using the story bible, write THREE different branching versions of the next scene "
        "(110-160 words each). Each branch takes the story in a clearly different direction. Respect every fact in "
        "the bible and keep each character's voice true to who they are (age, background, how they spoke before). "
        "Include dialogue in double quotes, with who is speaking. "
        f"What happens next: {direction}\n"
        f"Target emotion: {emotion}, intensity {intensity}/10. The underlying feeling may differ from what "
        f"characters say aloud. Give each branch a short title (Variation seed: {random.randint(1000, 999999)})." + extra
        + " Return ONLY JSON matching: " + json.dumps(Branches.model_json_schema())
        + "\n\nBIBLE:\n" + _bible_json(bible)
    )
    return Branches.model_validate_json(call_llm(prompt, temperature=0.75)).branches[:3]


def evaluate_branch(branch: Branch, bible: list[Fact], chapter: int) -> BranchResult:
    """Audit one generated scene: continuity check + emotion analysis."""
    try:
        flags = check(bible, branch.scene, chapter)
    except Exception as e:  # noqa: BLE001
        print("check failed:", str(e)[:80])
        flags = None
    try:
        emo = analyze_emotion(bible, branch.scene, chapter)
    except Exception as e:  # noqa: BLE001
        print("emotion failed:", str(e)[:80])
        emo = None
    return BranchResult(branch=branch, flags=flags, emotion=emo)


def write_branches_audited(bible: list[Fact], direction: str, emotion: str, intensity: int,
                           chapter: int, sabotage: bool = False) -> list[BranchResult]:
    """Generate 3 branches, then audit them in parallel. This is the main 'AI writes, AI checks itself' call."""
    branches = generate_branches(bible, direction, emotion, intensity, sabotage)
    with ThreadPoolExecutor(max_workers=3) as ex:
        return list(ex.map(lambda b: evaluate_branch(b, bible, chapter), branches))


def write_dialogue(bible: list[Fact], character: str, situation: str, emotion: str,
                   intensity: int) -> list[DialogueOption]:
    """Three alternative lines for one character, in that character's established voice."""
    prompt = (
        f"You are a co-writer. Using the story bible, write THREE different lines of dialogue for {character} "
        f"in this situation: {situation}\n"
        f"Target underlying emotion: {emotion}, intensity {intensity}/10. The line may hide the real feeling "
        "(subtext). Keep it true to who the character is (age, background, how they spoke before) and consistent "
        f"with every fact in the bible. Ensure fresh, diverse dialogue lines (Seed: {random.randint(1000, 999999)}). For each option give the line, the underlying emotion, intensity 1-10, and "
        "one sentence on why it fits the character's voice. Return ONLY JSON matching: "
        + json.dumps(DialogueOptions.model_json_schema())
        + "\n\nBIBLE:\n" + _bible_json(bible)
    )
    return DialogueOptions.model_validate_json(call_llm(prompt, temperature=0.8)).options


# --------------------------------------------------------------------------
# Smoke test:  python Story_Wave_model.py
# --------------------------------------------------------------------------
DEMO_CHAPTERS = [
    "Aarav, seventeen, lived in Delhi with his grandmother. He had brown eyes and wore the silver watch his late "
    "mother Meera had left him. The old lantern spirits of the city could never cross running water, his "
    "grandmother warned him.",
    "On Monday morning Aarav boarded the train in Delhi, clutching his mother's old watch. He had no idea that "
    "Meera had hidden a brass key somewhere in the old house; only his grandmother knew.",
    "By Monday evening Aarav was standing on the beach in Mumbai, watching the sun go down and asking strangers "
    "about the lantern spirits.",
    "Aarav squinted with his bright green eyes at the spirit drifting across the river toward him. "
    "'The key Mom hid under the staircase,' he said, 'is what you want, isn't it?'",
]
# Planted errors in chapters 3-4: Delhi->Mumbai in one day, brown->green eyes,
# a spirit crossing running water, Aarav knowing where the key is.

if __name__ == "__main__":
    story = []
    for i, ch in enumerate(DEMO_CHAPTERS, 1):
        if story:
            for c in check(story, ch, i):
                print(f"FLAG ch{i} [{c.type}] {c.explanation}")
        story = commit_scene(story, ch, i)
    print(f"Bible has {len(story)} facts (expect 4 flags above).")
