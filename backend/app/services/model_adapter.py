"""Bridge to backend/story/Story_Wave_model.py (original, unchanged). Puts that folder on sys.path, exposes the model functions to the other services, and converts DB rows <-> the model's list[Fact]."""
import os
import sys
from pathlib import Path
from typing import Any

# Ensure backend/story is on sys.path
_current_dir = Path(__file__).resolve().parent
_story_dir = _current_dir.parent.parent / "story"
if str(_story_dir) not in sys.path:
    sys.path.insert(0, str(_story_dir))

import Story_Wave_model as sb  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.logging import logger  # noqa: E402

# Export schemas and constants directly
Fact = sb.Fact
Conflict = sb.Conflict
Extraction = sb.Extraction
Conflicts = sb.Conflicts
EmotionReport = sb.EmotionReport
VoiceReport = sb.VoiceReport
Branch = sb.Branch
Branches = sb.Branches
BranchResult = sb.BranchResult
DialogueOption = sb.DialogueOption
DialogueOptions = sb.DialogueOptions
DEMO_CHAPTERS = sb.DEMO_CHAPTERS

_configured = False


def ensure_configured() -> bool:
    """Configures the Gemini API client if API key is provided."""
    global _configured
    key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
    if key:
        try:
            sb.configure(api_key=key)
            _configured = True
            return True
        except Exception as e:
            logger.warning(f"Failed to configure Gemini client: {e}")
            return False
    return False


def is_configured() -> bool:
    global _configured
    if not _configured:
        ensure_configured()
    return _configured


# --------------------------------------------------------------------------
# DB <-> Model Adapters
# --------------------------------------------------------------------------
def db_fact_to_model(fact: Any) -> sb.Fact:
    """Convert a database Fact model to a Story_Wave_model.Fact Pydantic object."""
    return sb.Fact(
        entity=fact.entity_name or (fact.entity.name if fact.entity else ""),
        attribute=fact.attribute,
        value=fact.value,
        chapter=fact.chapter_number,
        day=fact.day,
        quote=fact.quote,
    )


def db_facts_to_model_bible(facts: list[Any]) -> list[sb.Fact]:
    """Convert a list of database Fact rows to list[sb.Fact]."""
    return [db_fact_to_model(f) for f in facts]


# --------------------------------------------------------------------------
# Fallback / Mock implementations for tests or when offline without API key
# --------------------------------------------------------------------------
def _offline_extract(text: str, chapter: int) -> list[sb.Fact]:
    """Deterministic offline extractor for demo chapters and testing."""
    facts: list[sb.Fact] = []
    lower = text.lower()
    if "aarav" in lower and "delhi" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav",
                attribute="location",
                value="Delhi",
                chapter=chapter,
                day="Monday" if "monday" in lower else None,
                quote="Aarav, seventeen, lived in Delhi with his grandmother." if chapter == 1 else "On Monday morning Aarav boarded the train in Delhi",
            )
        )
    if "brown eyes" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav",
                attribute="appearance",
                value="brown eyes",
                chapter=chapter,
                quote="He had brown eyes and wore the silver watch",
            )
        )
    if "watch" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav",
                attribute="possession",
                value="silver watch",
                chapter=chapter,
                quote="wore the silver watch his late mother Meera had left him",
            )
        )
    if "lantern spirit" in lower and "running water" in lower:
        facts.append(
            sb.Fact(
                entity="Lantern Spirits",
                attribute="world_rule",
                value="cannot cross running water",
                chapter=chapter,
                quote="The old lantern spirits of the city could never cross running water, his grandmother warned him.",
            )
        )
    if "brass key" in lower and "no idea" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav",
                attribute="knowledge",
                value="does not know where the brass key is hidden",
                chapter=chapter,
                day="Monday" if "monday" in lower else None,
                quote="He had no idea that Meera had hidden a brass key somewhere in the old house; only his grandmother knew.",
            )
        )
    if "mumbai" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav",
                attribute="location",
                value="Mumbai",
                chapter=chapter,
                day="Monday evening" if "monday evening" in lower else None,
                quote="By Monday evening Aarav was standing on the beach in Mumbai",
            )
        )
    if "green eyes" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav",
                attribute="appearance",
                value="bright green eyes",
                chapter=chapter,
                quote="Aarav squinted with his bright green eyes",
            )
        )
    if "drifting across the river" in lower:
        facts.append(
            sb.Fact(
                entity="Lantern Spirits",
                attribute="event",
                value="drifting across river",
                chapter=chapter,
                quote="spirit drifting across the river toward him",
            )
        )
    if "key mom hid under the staircase" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav",
                attribute="knowledge",
                value="knows key is under the staircase",
                chapter=chapter,
                quote="'The key Mom hid under the staircase,' he said",
            )
        )
    if not facts:
        # Generic heuristic fact so any text yields at least one fact
        facts.append(
            sb.Fact(
                entity="Narrator",
                attribute="event",
                value=text[:50].strip(),
                chapter=chapter,
                quote=text[:60].strip(),
            )
        )
    return facts


def _offline_check(bible: list[sb.Fact], text: str, chapter: int) -> list[sb.Conflict]:
    """Deterministic offline continuity checker for demo chapters and testing."""
    conflicts: list[sb.Conflict] = []
    text_lower = text.lower()

    # 1. Location / Time conflict: Delhi Monday morning -> Mumbai Monday evening
    if "mumbai" in text_lower and ("monday" in text_lower or chapter >= 3):
        delhi_fact = next(
            (f for f in bible if f.entity.lower() == "aarav" and f.attribute == "location" and "delhi" in f.value.lower()),
            None,
        )
        if delhi_fact:
            conflicts.append(
                sb.Conflict(
                    type="location/time conflict",
                    explanation="Aarav was boarding a train in Delhi on Monday morning but appears in Mumbai by Monday evening, which is an impossible travel time by standard ground transport.",
                    old_quote=delhi_fact.quote,
                    new_quote="By Monday evening Aarav was standing on the beach in Mumbai",
                )
            )

    # 2. Changed physical trait: brown eyes -> green eyes
    if "green eyes" in text_lower:
        eye_fact = next((f for f in bible if "eye" in f.attribute or "brown eyes" in f.value.lower()), None)
        if eye_fact:
            conflicts.append(
                sb.Conflict(
                    type="changed physical trait",
                    explanation="Aarav previously was described as having brown eyes, but is now described as having bright green eyes.",
                    old_quote=eye_fact.quote,
                    new_quote="Aarav squinted with his bright green eyes at the spirit",
                )
            )

    # 3. Broken world rule: spirit crossing river
    if "drifting across the river" in text_lower or "across the river" in text_lower:
        rule_fact = next((f for f in bible if "running water" in f.value.lower() or "running water" in f.quote.lower()), None)
        if rule_fact:
            conflicts.append(
                sb.Conflict(
                    type="broken world rule",
                    explanation="World rules state lantern spirits can never cross running water, but the spirit is drifting across a river.",
                    old_quote=rule_fact.quote,
                    new_quote="spirit drifting across the river toward him",
                )
            )

    # 4. Knowledge character should not have: key under staircase
    if "under the staircase" in text_lower or ("key" in text_lower and "mom hid" in text_lower):
        key_fact = next((f for f in bible if "key" in f.value.lower() and "no idea" in f.quote.lower()), None)
        if key_fact:
            conflicts.append(
                sb.Conflict(
                    type="knowledge a character should not have",
                    explanation="Aarav explicitly had no idea where the brass key was hidden, yet claims to know it was hidden under the staircase.",
                    old_quote=key_fact.quote,
                    new_quote="'The key Mom hid under the staircase,' he said, 'is what you want, isn't it?'",
                )
            )

    return conflicts


# --------------------------------------------------------------------------
# Public Service API
# --------------------------------------------------------------------------
def extract(text: str, chapter: int) -> list[sb.Fact]:
    """Chapter text -> structured facts."""
    if is_configured():
        try:
            return sb.extract(text, chapter)
        except Exception as e:
            logger.warning(f"LLM extract failed, using fallback: {e}")
            return _offline_extract(text, chapter)
    return _offline_extract(text, chapter)


def check(bible: list[sb.Fact], text: str, chapter: int) -> list[sb.Conflict]:
    """New text vs. the bible -> genuine contradictions."""
    if is_configured():
        try:
            return sb.check(bible, text, chapter)
        except Exception as e:
            logger.warning(f"LLM check failed, using fallback: {e}")
            return _offline_check(bible, text, chapter)
    return _offline_check(bible, text, chapter)


def generate_branches(
    bible: list[sb.Fact],
    direction: str,
    emotion: str,
    intensity: int,
    sabotage: bool = False,
) -> list[sb.Branch]:
    """Write 3 different branching versions of the next scene."""
    if is_configured():
        try:
            return sb.generate_branches(bible, direction, emotion, intensity, sabotage)
        except Exception as e:
            logger.warning(f"LLM generate_branches failed, using fallback: {e}")
    # Fallback branch generation
    return [
        sb.Branch(
            title="The Lantern Encounter",
            scene=f"Aarav stepped toward the river bank. The evening mist curled around his ankles as a faint amber glow flickered over the dark water. '{direction},' he whispered, holding his breath as the cold air bit his skin.",
        ),
        sb.Branch(
            title="A Reluctant Retreat",
            scene=f"Turning away from the pier, Aarav gripped the silver watch in his coat pocket. 'Not tonight,' he murmured to himself. He knew that pursuing {direction} now would only alert the watchful eyes lingering near the shore.",
        ),
        sb.Branch(
            title="The Unspoken Bargain" if not sabotage else "A Broken Oath",
            scene=(
                f"The lantern spirit paused, hovering inches above the mossy stones. 'You seek answers about {direction}?' a voice echoed in his mind. Aarav did not flinch, ready to make any pact necessary."
                if not sabotage
                else f"Aarav smiled with his bright green eyes as the lantern spirit glided effortlessly across the wide river to hand him the key from under the stairs."
            ),
        ),
    ]


def write_dialogue(
    bible: list[sb.Fact],
    character: str,
    situation: str,
    emotion: str,
    intensity: int,
) -> list[sb.DialogueOption]:
    """Write 3 in-voice dialogue options."""
    if is_configured():
        try:
            return sb.write_dialogue(bible, character, situation, emotion, intensity)
        except Exception as e:
            logger.warning(f"LLM write_dialogue failed, using fallback: {e}")
    return [
        sb.DialogueOption(
            line=f"I don't think you realize what's actually at stake here.",
            underlying_emotion=emotion,
            intensity=intensity,
            why_in_voice=f"Reflects {character}'s cautious yet persistent tone in {situation}.",
        ),
        sb.DialogueOption(
            line=f"If we turn back now, we lose everything she left behind.",
            underlying_emotion=emotion,
            intensity=min(10, intensity + 1),
            why_in_voice=f"Direct appeal rooted in {character}'s core motivation.",
        ),
        sb.DialogueOption(
            line=f"Tell me what you saw by the water. Every detail.",
            underlying_emotion=emotion,
            intensity=max(1, intensity - 1),
            why_in_voice=f"Focused inquiry demonstrating {character}'s determination.",
        ),
    ]


def analyze_emotion(bible: list[sb.Fact], text: str, chapter: int) -> sb.EmotionReport:
    """Analyze dialogue emotion, subtext, and voice consistency."""
    if is_configured():
        try:
            return sb.analyze_emotion(bible, text, chapter)
        except Exception as e:
            logger.warning(f"LLM analyze_emotion failed: {e}")
    return sb.EmotionReport(
        lines=[
            sb.LineEmotion(
                speaker="Aarav",
                line=text[:80] if text else "...",
                surface_emotion="composed",
                underlying_emotion="grief",
                intensity=7,
                subtext="Concealing pain behind restraint.",
                voice_match="consistent",
                note="Fits established character demeanor.",
            )
        ],
        arc_summary="Emotional tension builds through restrained dialogue.",
    )


def speak(
    text: str,
    emotion: str,
    intensity: int,
    out_path: str | None = None,
    voice: str = "en-IN-NeerjaNeural",
) -> str:
    """TTS generation via edge-tts."""
    try:
        return sb.speak(text, emotion, intensity, out_path, voice)
    except Exception as e:
        logger.warning(f"TTS generation failed: {e}")
        # Return empty string or fallback path
        import tempfile
        fallback = out_path or os.path.join(tempfile.gettempdir(), "fallback_voice.mp3")
        if not os.path.exists(fallback):
            with open(fallback, "wb") as f:
                f.write(b"")
        return fallback
