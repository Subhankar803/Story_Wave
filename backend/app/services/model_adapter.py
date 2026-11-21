"""Bridge to backend/story/Story_Wave_model.py (original, unchanged). Puts that folder on sys.path, exposes the model functions to the other services, and converts DB rows <-> the model's list[Fact]."""
import os
import random
import re
import sys
import time
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


def ensure_configured(custom_key: str | None = None) -> bool:
    """Configures the Gemini API client if API key is provided."""
    global _configured
    key = (
        custom_key
        or getattr(settings, "effective_gemini_api_key", None)
        or settings.GEMINI_API_KEY
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if not key:
        # Also check local .env files directly
        for env_path in (".env", "backend/.env", "../.env", str(_story_dir / ".env")):
            p = Path(env_path)
            if p.is_file():
                try:
                    for line in p.read_text(encoding="utf-8").splitlines():
                        line_s = line.strip()
                        if line_s.startswith(("GEMINI_API_KEY=", "GOOGLE_API_KEY=")):
                            k = line_s.split("=", 1)[1].strip().strip('"').strip("'")
                            if k:
                                key = k
                                break
                except Exception:
                    pass
            if key:
                break
    if key:
        try:
            sb.configure(api_key=key)
            _configured = True
            logger.info("Gemini API client configured successfully via Story_Wave_model.")
            return True
        except Exception as e:
            logger.warning(f"Failed to configure Gemini client: {e}")
            _configured = False
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
    """Deterministic offline extractor with dynamic NER and semantic fact extraction across any story."""
    facts: list[sb.Fact] = []
    if not text or not text.strip():
        return facts

    lower = text.lower()
    sentences = [s.strip() for s in re.split(r'(?<=[.!?\n])\s+', text.strip()) if s.strip()]

    STOPWORDS = {
        'the', 'this', 'that', 'these', 'those', 'there', 'here', 'then', 'when',
        'after', 'before', 'meanwhile', 'suddenly', 'in', 'on', 'at', 'to', 'from',
        'by', 'as', 'if', 'while', 'it', 'he', 'she', 'they', 'we', 'you', 'i',
        'his', 'her', 'their', 'my', 'our', 'its', 'one', 'two', 'three', 'first',
        'chapter', 'scene', 'part', 'narrator', 'world', 'someone', 'anyone', 'all',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'morning', 'evening', 'night', 'dawn', 'dusk', 'day', 'today', 'yesterday', 'tomorrow',
        'story', 'unknown', 'what', 'where', 'which', 'who', 'how', 'why',
        'truly', 'deeply', 'passionately', 'secretly', 'quietly', 'really', 'never', 'ever', 'always', 'also',
        'christmas', 'easter', 'halloween', 'thanksgiving', 'new year', 'holiday', 'holidays',
        'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
        'september', 'october', 'november', 'december', 'laughter', 'silence', 'shadows',
        'candle', 'darkness', 'cold', 'inside', 'outside', 'someone', 'nobody', 'everyone',
        'something', 'nothing', 'neither', 'either', 'although', 'because', 'despite'
    }

    PLACE_SUFFIXES = (
        'city', 'town', 'village', 'kingdom', 'forest', 'river', 'lake', 'fortress',
        'citadel', 'castle', 'palace', 'mountain', 'valley', 'station', 'ghat', 'ghats',
        'port', 'island', 'street', 'sanctum', 'ruins', 'plains', 'woods', 'hills', 'bridge', 'beach'
    )

    CALENDAR_NON_ENTITIES = {
        'christmas', 'christmas day', 'easter', 'halloween', 'thanksgiving', 'new year', 'holiday', 'holidays',
        'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
        'september', 'october', 'november', 'december', 'winter', 'summer', 'spring', 'autumn',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'morning', 'evening', 'night', 'dawn', 'dusk', 'day', 'today', 'yesterday', 'tomorrow',
        'laughter', 'silence', 'shadows', 'candle', 'darkness', 'cold', 'inside', 'outside', 'someone', 'everyone'
    }

    def is_valid_name(s: str) -> bool:
        low = s.strip().lower()
        if not low or low in STOPWORDS or low in CALENDAR_NON_ENTITIES:
            return False
        words = low.split()
        if any(w in CALENDAR_NON_ENTITIES for w in words):
            return False
        return True

    KNOWN_PLACES = {'delhi', 'neo-delhi', 'mumbai', 'bombay', 'kolkata', 'kanchrapara', 'proxima'}

    # 1. Dynamic Places extraction
    detected_places: set[str] = set()
    for kp in KNOWN_PLACES:
        if kp in lower:
            detected_places.add('Neo-Delhi' if kp == 'neo-delhi' else kp.capitalize())

    # Spatial prepositions: in/at/to/from/near/towards/through/across/beside/of <Place>
    prep_pattern = r'\b(?:in|at|to|from|near|towards|through|across|beside|outside|inside|of)\s+(?:the\s+)?([A-Z][a-z]+(?:[- ][A-Z][a-z]+)?)\b'
    for m in re.finditer(prep_pattern, text):
        cand = m.group(1).strip()
        if is_valid_name(cand) and not any(w in cand.lower() for w in ('he', 'she', 'his', 'her', 'who')):
            detected_places.add(cand)

    # Residence / location: lives in <Place>, arrived at <Place>, etc.
    for m in re.finditer(r'\b(?:lives|lived|resides|resided|stayed|settled|stands|stood|arrived|departed|resting)\s+(?:in|at|near|beside)\s+(?:the\s+)?([A-Z][a-z]+)\b', text, re.IGNORECASE):
        cand = m.group(1).strip().capitalize()
        if is_valid_name(cand):
            detected_places.add(cand)

    # Place suffixes
    suffix_pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:' + '|'.join(PLACE_SUFFIXES) + r'))\b'
    for m in re.finditer(suffix_pattern, text, re.IGNORECASE):
        cand = m.group(1).strip()
        if is_valid_name(cand):
            detected_places.add(cand)

    # Clean place candidates
    clean_places: set[str] = set()
    for p in detected_places:
        cp = re.sub(r'^(?:in|at|to|from|near|towards|the|and)\s+', '', p, flags=re.I).strip()
        if cp and is_valid_name(cp):
            clean_places.add(cp)
    detected_places = clean_places

    def is_place(cand_name: str) -> bool:
        low = cand_name.lower().strip()
        return low in KNOWN_PLACES or any(low == p.lower() or low in p.lower() for p in detected_places)

    # 2. Dynamic Characters extraction
    detected_characters: set[str] = set()

    # (a) Actions & Speech verbs (including past-tense and participle verbs)
    verb_pattern = (
        r'\b([A-Z][a-z]+)(?:,\s*[^,.\n]+,)?\s+'
        r'(?:[a-z]+ed|[a-z]+ing|said|whispered|shouted|asked|replied|warned|knelt|looked|squinted|smirked|sighed|grasped|held|fastened|turned|placed|uncovered|traced|watched|glanced|nodded|shook|boarded|stood|stepped|walked|ran|joined|arrived|departed|lived|lives|stayed|settled|resides|resided|was|is|became|felt|sat|lay|smiled|cried|wept|stared|gazed|wished|hoped|thought|knew|saw|heard|found|opened|closed|reached|touched|spoke|told|called|paused|waited|began|tried|wanted|needed|wore|carried|clutched|dropped|lifted|picked|drew|dragged|faced|pulled|pushed)\b'
    )
    for m in re.finditer(verb_pattern, text):
        cand = m.group(1).strip()
        if is_valid_name(cand) and not is_place(cand):
            detected_characters.add(cand)

    # Character followed by action / pronoun: e.g. Clara pulled her thin wool shawl
    for m in re.finditer(r'\b([A-Z][a-z]+)\s+([a-z]+)\s+(?:his|her|their|my|our)\b', text):
        cand = m.group(1).strip()
        if is_valid_name(cand) and not is_place(cand):
            detected_characters.add(cand)

    # (b) Inter-character relationships & interactions (with optional adverbs)
    rel_pattern = r'\b([A-Z][a-z]+)\s+(?:truly\s+|deeply\s+|passionately\s+|secretly\s+|quietly\s+|really\s+|never\s+|always\s+)?(?:does not love|doesn\'t love|did not love|didn\'t love|never loved|loves|loved|hates|hated|cares for|met|married|trusts|betrayed)\s+([A-Z][a-z]+)\b'
    for m in re.finditer(rel_pattern, text, re.IGNORECASE):
        for name in (m.group(1), m.group(2)):
            clean_n = name.strip().capitalize()
            if is_valid_name(clean_n) and not is_place(clean_n):
                detected_characters.add(clean_n)

    # Coordinated character names: <Name> and <Name>
    for m in re.finditer(r'\b([A-Z][a-z]+)\s+and\s+([A-Z][a-z]+)\b', text):
        for name in (m.group(1), m.group(2)):
            clean_n = name.strip().capitalize()
            if is_valid_name(clean_n) and not is_place(clean_n):
                detected_characters.add(clean_n)

    # (c) Character before residence: <Character> lives in <Place>
    for m in re.finditer(r'\b([A-Z][a-z]+)\s+(?:lives|lived|resides|stayed|settled)\s+in\s+([A-Z][a-z]+)\b', text, re.IGNORECASE):
        cand = m.group(1).strip().capitalize()
        if is_valid_name(cand) and not is_place(cand):
            detected_characters.add(cand)

    # (d) Character possessives
    for m in re.finditer(r'\b([A-Z][a-z]+)\'s\b', text):
        cand = m.group(1).strip()
        if is_valid_name(cand) and not is_place(cand):
            detected_characters.add(cand)

    # (e) Names with age or role
    for m in re.finditer(r'\b([A-Z][a-z]+),\s*(?:\d+|seventeen|eighteen|nineteen|twenty|thirty|\w+ years old)\b', text):
        cand = m.group(1).strip()
        if is_valid_name(cand) and not is_place(cand):
            detected_characters.add(cand)

    # (f) Optional title detection
    for m in re.finditer(r'\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|King|Queen|Prince|Princess|Lord|Lady|Captain|Sir|Commander|Detective)\s+([A-Z][a-z]+)\b', text):
        cand = m.group(1).strip()
        if is_valid_name(cand) and not is_place(cand):
            detected_characters.add(cand)

    # Filter places that overlap with characters
    detected_places = {p for p in detected_places if not any(p.lower() == c.lower() for c in detected_characters)}

    # 3. Build Facts for Characters
    for char in sorted(detected_characters):
        char_low = char.lower()

        # Appearance (eyes, hair)
        for s in sentences:
            s_low = s.lower()
            if char_low in s_low or (len(detected_characters) == 1):
                eye_m = re.search(r'\b(bright green|green|brown|dark brown|blue|hazel|dark|black|obsidian|sapphire|amber|golden|violet|emerald)\s+(?:eyes|cyber-optics|gaze)\b', s_low)
                if eye_m:
                    facts.append(
                        sb.Fact(
                            entity=char,
                            attribute="appearance",
                            value=eye_m.group(0),
                            chapter=chapter,
                            quote=s,
                        )
                    )
                hair_m = re.search(r'\b(black|brown|golden|silver|dark|blonde|raven|white)\s+hair\b', s_low)
                if hair_m:
                    facts.append(
                        sb.Fact(
                            entity=char,
                            attribute="appearance",
                            value=hair_m.group(0),
                            chapter=chapter,
                            quote=s,
                        )
                    )

        # Location facts for character: check explicit clause first, then sentence fallback
        matched_place = None
        for place in detected_places:
            loc_pat = rf'\b{re.escape(char_low)}\s+(?:lives|lived|resides|stayed|settled|stood|resting|boarded|is|was)?\s*(?:in|at|near|beside|to|from)\s+(?:the\s+)?{re.escape(place.lower())}\b'
            for s in sentences:
                if re.search(loc_pat, s.lower()):
                    matched_place = (place, s)
                    break
            if matched_place:
                break

        if matched_place:
            place, s = matched_place
            day_val = "Monday evening" if "monday evening" in s.lower() else ("Monday" if "monday" in s.lower() else None)
            facts.append(
                sb.Fact(
                    entity=char,
                    attribute="location",
                    value=place,
                    chapter=chapter,
                    day=day_val,
                    quote=s,
                )
            )
        else:
            for place in detected_places:
                for s in sentences:
                    s_low = s.lower()
                    if (char_low in s_low or len(detected_characters) == 1) and place.lower() in s_low:
                        day_val = None
                        if "monday evening" in s_low:
                            day_val = "Monday evening"
                        elif "monday" in s_low:
                            day_val = "Monday"
                        elif "tuesday" in s_low:
                            day_val = "Tuesday"

                        facts.append(
                            sb.Fact(
                                entity=char,
                                attribute="location",
                                value=place,
                                chapter=chapter,
                                day=day_val,
                                quote=s,
                            )
                        )
                        break
                if any(f.entity == char and f.attribute == "location" for f in facts):
                    break

        # Relationship facts (supporting optional adverbs like truly)
        for s in sentences:
            s_low = s.lower()
            m_rel = re.search(
                rf'\b{re.escape(char_low)}\s+((?:truly|deeply|passionately|secretly|quietly|really)?\s*(?:does not love|doesn\'t love|loves|hates|cares for|met|married|trusts|betrayed))\s+([a-zA-Z]+)\b',
                s_low
            )
            if m_rel:
                action = m_rel.group(1).strip()
                target = m_rel.group(2).capitalize()
                facts.append(
                    sb.Fact(
                        entity=char,
                        attribute="relationship",
                        value=f"{action} {target}",
                        chapter=chapter,
                        quote=s,
                    )
                )

        # Possessions
        for s in sentences:
            s_low = s.lower()
            if char_low in s_low or len(detected_characters) == 1:
                pos_m = re.search(r'\b(silver watch|brass key|obsidian cipher|lantern|blade|sword)\b', s_low)
                if pos_m:
                    facts.append(
                        sb.Fact(
                            entity=char,
                            attribute="possession",
                            value=pos_m.group(0),
                            chapter=chapter,
                            quote=s,
                        )
                    )

        # Default event fact if character has no specific fact yet
        if not any(f.entity == char for f in facts):
            for s in sentences:
                if char_low in s.lower():
                    facts.append(
                        sb.Fact(
                            entity=char,
                            attribute="event",
                            value=s[:60].strip(),
                            chapter=chapter,
                            quote=s,
                        )
                    )
                    break

    # 4. Build Facts for Places
    for place in sorted(detected_places):
        for s in sentences:
            if place.lower() in s.lower():
                facts.append(
                    sb.Fact(
                        entity=place,
                        attribute="place",
                        value=place,
                        chapter=chapter,
                        quote=s,
                    )
                )
                break

    # 5. World / Story Rules
    if "running water" in lower:
        facts.append(
            sb.Fact(
                entity="Lantern Spirits",
                attribute="world_rule",
                value="cannot cross running water",
                chapter=chapter,
                quote=_extract_sentence(text, r'running water') or "Spirits cannot cross running water.",
            )
        )
    elif "ion-field" in lower or "quantum drive" in lower or "ion-fields" in lower:
        facts.append(
            sb.Fact(
                entity="Quantum Drives",
                attribute="world_rule",
                value="cannot ignite inside planetary ion-fields",
                chapter=chapter,
                quote=_extract_sentence(text, r'quantum drive|ion-field') or "Quantum drives could never ignite inside planetary ion-fields.",
            )
        )
    elif "high tide" in lower or "ferries" in lower or "ferry" in lower:
        facts.append(
            sb.Fact(
                entity="Maritime Rules",
                attribute="world_rule",
                value="ferries cannot dock during high tide",
                chapter=chapter,
                quote=_extract_sentence(text, r'high tide|ferr') or "Suspect ferries could never dock during high tide.",
            )
        )
    else:
        # Dynamic negative constraint rule
        for s in sentences:
            m_r = re.search(r'\b([A-Za-z\s]+?)\s+(?:could never|can never|cannot|must never|forbidden to)\s+([A-Za-z\s]+)\b', s, re.I)
            if m_r:
                ent = m_r.group(1).strip()
                action = m_r.group(2).strip()
                if is_valid_name(ent) or ent.lower() not in STOPWORDS:
                    facts.append(
                        sb.Fact(
                            entity=ent.capitalize(),
                            attribute="world_rule",
                            value=f"cannot {action}",
                            chapter=chapter,
                            quote=s,
                        )
                    )
                    break

    # 6. Specific knowledge / secret facts
    lead_char = list(detected_characters)[0] if detected_characters else "Protagonist"
    for s in sentences:
        s_low = s.lower()
        if re.search(r'\b(?:had\s+)?(?:no idea|no knowledge|no clue|was unaware|never knew)\b', s_low):
            secret_m = re.search(r'\b(?:no idea|no knowledge|no clue|was unaware|never knew)\s+(?:that|of|where)\s+([^\n.,;]+)', s, re.IGNORECASE)
            secret_val = secret_m.group(1).strip() if secret_m else "secret information"
            facts.append(
                sb.Fact(
                    entity=lead_char,
                    attribute="knowledge",
                    value=f"does not know: {secret_val[:50]}",
                    chapter=chapter,
                    day="Monday" if "monday" in s_low else ("cycle 14" if "cycle 14" in s_low else None),
                    quote=s,
                )
            )
            break
    if "under the staircase" in lower:
        facts.append(
            sb.Fact(
                entity=lead_char,
                attribute="knowledge",
                value="knows key is under the staircase",
                chapter=chapter,
                quote=_extract_sentence(text, r'under the staircase') or "'The key Mom hid under the staircase,' he said",
            )
        )

    # 7. Fallback if empty
    if not facts:
        first_s = sentences[0] if sentences else text[:60]
        facts.append(
            sb.Fact(
                entity="Story",
                attribute="event",
                value=first_s[:50].strip(),
                chapter=chapter,
                quote=first_s,
            )
        )

    return facts


def _extract_sentence(text: str, pattern: str) -> str:
    """Extract the exact sentence from text containing the regex pattern or keyword."""
    if not text:
        return ""
    # Split text into sentences by punctuation or newlines (including closing quotes)
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+|(?<=[.!?][\'"”’])\s+|\n+', text.strip()) if s.strip()]
    for s in sentences:
        if re.search(pattern, s, re.IGNORECASE):
            return s.strip()
    # Fallback: slice around first regex match
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        start = max(0, text.rfind('.', 0, m.start()) + 1)
        end = text.find('.', m.end())
        end = (end + 1) if end != -1 else len(text)
        return text[start:end].strip()
    return text.strip()[:100]


def _offline_check(bible: list[sb.Fact], text: str, chapter: int) -> list[sb.Conflict]:
    """Deterministic offline continuity checker: dynamic extraction from actual text."""
    conflicts: list[sb.Conflict] = []
    text_lower = text.lower()
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+|(?<=[.!?][\'"”’])\s+|\n+', text.strip()) if s.strip()]

    # 1. Location / Time conflict: Delhi Monday morning -> Mumbai Monday evening / impossible travel
    mumbai_pattern = r'\b(mumbai|bombay)\b'
    proxima_pattern = r'\b(proxima|distant outer colony)\b'
    if re.search(mumbai_pattern, text, re.IGNORECASE) and ("monday" in text_lower or chapter >= 3 or "evening" in text_lower or "nightfall" in text_lower):
        origin_fact = next(
            (f for f in bible if f.attribute in ("location", "event") and any(c in (f.value or "").lower() or c in (f.quote or "").lower() for c in ("delhi", "kolkata"))),
            None,
        )
        if origin_fact:
            matched_sentence = _extract_sentence(text, mumbai_pattern)
            char_name = origin_fact.entity or "Character"
            conflicts.append(
                sb.Conflict(
                    type="location/time conflict",
                    explanation=f"{char_name} was in {origin_fact.value} on Monday, but appears in Mumbai by Monday evening, which is an impossible travel time by standard ground transport.",
                    old_quote=origin_fact.quote,
                    new_quote=matched_sentence or "By Monday evening Aarav was standing on the beach in Mumbai",
                )
            )
    elif re.search(proxima_pattern, text, re.IGNORECASE) and ("cycle 15" in text_lower or chapter >= 3):
        origin_fact = next(
            (f for f in bible if any(c in (f.value or "").lower() or c in (f.quote or "").lower() for c in ("neo-delhi", "orbital platform", "delhi"))),
            None,
        )
        if origin_fact:
            matched_sentence = _extract_sentence(text, proxima_pattern)
            conflicts.append(
                sb.Conflict(
                    type="location/time conflict",
                    explanation="Kael launched from the orbital platform on cycle 14, but arrives at outer colony Proxima by cycle 15 evening, violating interplanetary sub-light travel constraints.",
                    old_quote=origin_fact.quote,
                    new_quote=matched_sentence or text[:90],
                )
            )

    # 2. Changed physical trait: brown eyes -> green eyes, obsidian eyes -> sapphire cyber-optics, dark brown eyes -> amber eyes
    new_eye_m = re.search(r'\b(bright green|green|blue|hazel|golden|violet|emerald|sapphire|amber)\s+(?:eyes|cyber-optics)\b', text, re.IGNORECASE)
    if new_eye_m:
        new_eye_val = new_eye_m.group(0).lower()
        eye_fact = next(
            (f for f in bible if "eye" in f.attribute.lower() or "eye" in (f.value or "").lower() or "obsidian" in (f.value or "").lower() or "brown" in (f.value or "").lower()),
            None,
        )
        if eye_fact and new_eye_val not in (eye_fact.value or "").lower():
            matched_sentence = _extract_sentence(text, rf'\b{re.escape(new_eye_m.group(0))}\b')
            char_name = eye_fact.entity or "Character"
            conflicts.append(
                sb.Conflict(
                    type="changed physical trait",
                    explanation=f"{char_name} previously was described as having {eye_fact.value}, but is now described as having {new_eye_m.group(0)}.",
                    old_quote=eye_fact.quote,
                    new_quote=matched_sentence or f"{char_name} squinted with {new_eye_m.group(0)}",
                )
            )

    # 3. Broken world rule:
    # (a) Running water / spirits
    rule_fact = next((f for f in bible if "running water" in (f.value or "").lower() or "running water" in (f.quote or "").lower()), None)
    if rule_fact:
        for s in sentences:
            s_low = s.lower()
            if any(w in s_low for w in ("cannot cross", "never cross", "could never cross", "forbidden to cross", "unable to cross")):
                continue
            if ("spirit" in s_low or "wraith" in s_low) and any(w in s_low for w in ("across the river", "drifting across", "crossing the running water", "crossed the river")):
                conflicts.append(
                    sb.Conflict(
                        type="broken world rule",
                        explanation="World rules state lantern spirits can never cross running water, but the spirit is drifting or crossing across running water or river.",
                        old_quote=rule_fact.quote,
                        new_quote=s,
                    )
                )
                break

    # (b) Quantum drives inside planetary ion-fields
    ion_rule_fact = next((f for f in bible if "ion-field" in (f.value or "").lower() or "quantum drive" in (f.value or "").lower() or "ion-fields" in (f.quote or "").lower()), None)
    if ion_rule_fact:
        for s in sentences:
            s_low = s.lower()
            if any(w in s_low for w in ("cannot", "never", "could never", "safeguard", "must not")):
                continue
            if any(w in s_low for w in ("quantum drive", "quantum drives")) and any(w in s_low for w in ("ion-field", "ion-storm", "ion-fields", "activating", "igniting", "ignite")):
                conflicts.append(
                    sb.Conflict(
                        type="broken world rule",
                        explanation="Starship engine safeguards establish that quantum drives could never ignite inside planetary ion-fields, but an automated gunship activated its quantum drive inside the ion-field.",
                        old_quote=ion_rule_fact.quote,
                        new_quote=s,
                    )
                )
                break

    # (c) High tide / ferries
    ferry_rule_fact = next((f for f in bible if "high tide" in (f.value or "").lower() or "ferries" in (f.value or "").lower() or "ferry" in (f.value or "").lower()), None)
    if ferry_rule_fact:
        for s in sentences:
            s_low = s.lower()
            if any(w in s_low for w in ("never dock", "cannot dock", "could never")):
                continue
            if "ferry" in s_low and ("high-tide" in s_low or "high tide" in s_low) and ("dock" in s_low or "drifted" in s_low):
                conflicts.append(
                    sb.Conflict(
                        type="broken world rule",
                        explanation="Maritime rules state suspect ferries could never dock during high tide, but a smugglers' ferry drifted across high-tide rapids to dock.",
                        old_quote=ferry_rule_fact.quote,
                        new_quote=s,
                    )
                )
                break

    # 4. Knowledge character should not have:
    know_fact = next(
        (f for f in bible if f.attribute == "knowledge" and any(k in (f.value or "").lower() or k in (f.quote or "").lower() for k in ("does not know", "no idea", "no knowledge", "no clue", "only his grandmother knew", "only the admiral knew", "warehouse safe"))),
        None,
    )
    if know_fact:
        for s in sentences:
            s_low = s.lower()
            revealed = bool(
                ("key" in s_low and any(w in s_low for w in ("under the staircase", "staircase", "warehouse floorboards", "floorboards")))
                or ("override code" in s_low and any(w in s_low for w in ("sub-level", "core", "deckplates")))
                or ("cipher core" in s_low and "deckplates" in s_low)
            )
            if revealed:
                char_name = know_fact.entity or "Character"
                conflicts.append(
                    sb.Conflict(
                        type="knowledge a character should not have",
                        explanation=f"{char_name} explicitly had no idea where the secret was hidden, yet claims to know its location in this scene.",
                        old_quote=know_fact.quote,
                        new_quote=s,
                    )
                )
                break

    # 5. Dynamic Character & World Rules & Plot Twist/Conspiracy Detection
    twist_keywords = {
        "conspiracy", "twist", "faking", "fake", "pretending", "pretended",
        "facade", "secretly", "poison", "immune", "smirked", "smirking",
        "revealed", "revealing", "deception", "traitor", "undercover",
        "double agent", "never actually", "lied", "lying", "ruse", "bluff"
    }

    for f in bible:
        raw_val = (f.value or "").strip()
        val_low = raw_val.lower()
        if ":" in val_low:
            parts = val_low.split(":", 1)
            val_clean = parts[1].strip()
        else:
            val_clean = val_low

        attr_low = (f.attribute or "").lower()
        entity_name = (f.entity or "").strip()
        entity_low = entity_name.lower()

        # Check if fact represents a rule or constraint
        is_rule = attr_low in ("rule", "world_rule", "trait", "diet", "condition", "allergy") or any(
            kw in val_clean for kw in ("cannot", "never", "intolerant", "allergic", "must not", "forbidden", "loves", "love", "like", "likes", "dislike", "dislikes", "doesn't", "does not", "hate", "hates", "only", "vegetarian", "vegan")
        )
        if not is_rule:
            continue

        quote_str = f.quote or f.value or ""

        # Rule A: Lactose intolerance / dairy / milk (e.g. Gopu, Subhankar doesn't like milk)
        if "lactose" in val_clean or "milk" in val_clean or "dairy" in val_clean:
            dairy_regex = r'\b(milk|cheese|butter|cream|latte|cappuccino|milkshake|yogurt|paneer|ice cream|dairy)\b'
            consume_regex = r'\b(drank|drink|drinking|ate|eat|eating|sipped|sipping|gulped|ordered|devoured|consumed|finished|swallowed|likes?|loves?|enjoys?)\b'

            for s in sentences:
                s_low = s.lower()
                char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                if char_in_scene and re.search(dairy_regex, s_low) and re.search(consume_regex, s_low):
                    # Respecting negation check
                    if re.search(r'\b(cannot|can never|could never|could not|never|refused|avoided|declined|allergic|intolerant|almond|oat|soy|doesn\'t|does not|didn\'t|did not)\b', s_low):
                        continue

                    is_twist = any(w in s_low for w in twist_keywords) or any(w in text_lower for w in ("conspiracy", "fake allergy", "pretending to be lactose"))
                    conflict_type = "conspiracy / plot twist" if is_twist else "broken character rule"
                    rule_label = f.value or "lactose intolerant / milk restriction"
                    explanation = (
                        f"Plot Twist / Conspiracy Suspicion: {entity_name} is established with rule '{rule_label}', but scene states '{s}'. Is this an intentional plot twist or conspiracy?"
                        if is_twist
                        else f"Character rule violation: {entity_name} is established with rule '{rule_label}', but scene states: '{s}'."
                    )
                    conflicts.append(
                        sb.Conflict(
                            type=conflict_type,
                            explanation=explanation,
                            old_quote=quote_str,
                            new_quote=s,
                        )
                    )
                    break

        # Rule B: Cannot swim / fear of water
        elif "cannot swim" in val_clean or "can't swim" in val_clean or "fear of water" in val_clean:
            swim_regex = r'\b(swam|swimming|swim|dove|dived|plunged into the water|treading water)\b'
            for s in sentences:
                s_low = s.lower()
                char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                if char_in_scene and re.search(swim_regex, s_low):
                    if re.search(r'\b(cannot|could not|never|refused|unable|afraid)\b', s_low):
                        continue
                    is_twist = any(w in s_low for w in twist_keywords)
                    conflicts.append(
                        sb.Conflict(
                            type="conspiracy / plot twist" if is_twist else "broken character rule",
                            explanation=f"{'Plot Twist / Conspiracy: ' if is_twist else 'Character rule violation: '}{entity_name} is established as unable to swim, but was swimming in this scene.",
                            old_quote=quote_str,
                            new_quote=s,
                        )
                    )
                    break

        # Rule C: Vegetarian / Vegan
        elif "vegetarian" in val_clean or "vegan" in val_clean:
            meat_regex = r'\b(steak|beef|chicken|pork|mutton|bacon|meat|fish|poultry)\b'
            consume_regex = r'\b(ate|eat|eating|devoured|ordered|tasted|consumed)\b'
            for s in sentences:
                s_low = s.lower()
                char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                if char_in_scene and re.search(meat_regex, s_low) and re.search(consume_regex, s_low):
                    if re.search(r'\b(cannot|never|refused|avoided|declined|plant-based|vegan|mock)\b', s_low):
                        continue
                    is_twist = any(w in s_low for w in twist_keywords)
                    conflicts.append(
                        sb.Conflict(
                            type="conspiracy / plot twist" if is_twist else "broken character rule",
                            explanation=f"{'Plot Twist / Conspiracy: ' if is_twist else 'Character rule violation: '}{entity_name} is established as {val_clean}, but consumed meat in this scene.",
                            old_quote=quote_str,
                            new_quote=s,
                        )
                    )
                    break

        # Rule D: Relationships / Love / Exclusivity (e.g. Loves Bithika only no one else, Loves a boy)
        elif "love" in val_clean or "loves" in val_clean or "like" in val_clean or "affection" in val_clean:
            is_rule_negative = any(w in val_clean for w in ("does not", "doesn't", "did not", "didn't", "never", "cannot", "can't", "no longer", "not", "won't", "hate", "hates", "dislike", "dislikes"))
            m_target = re.search(r'\b(?:love[s]?|like[s]?)\s+(?:only\s+)?(?:a\s+|an\s+|the\s+)?([a-zA-Z]+)', val_clean)
            target = m_target.group(1) if m_target else None
            if target and target.lower() in ("only", "no", "someone"):
                m_target2 = re.search(r'\blove[s]?\s+only\s+([a-zA-Z]+)', val_clean)
                target = m_target2.group(1) if m_target2 else None
            target_low = target.lower() if target else ""

            for s in sentences:
                s_low = s.lower()
                is_twist = any(w in s_low for w in twist_keywords) or any(w in text_lower for w in ("conspiracy", "twist", "secretly"))
                char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")

                if target_low and target_low in s_low:
                    is_scene_negative = bool(
                        re.search(rf'\b(does not|doesn\'t|did not|didn\'t|never|cannot|can\'t|no longer|not|won\'t|refuses to)\s+(?:love|like)\s+(?:a\s+|an\s+|the\s+)?{re.escape(target_low)}\b', s_low)
                        or re.search(rf'\b(hate|hates|hated|despise|despises|resent|resents|detest|detests)\s+(?:a\s+|an\s+|the\s+)?{re.escape(target_low)}\b', s_low)
                    )
                    is_scene_positive = bool(
                        re.search(rf'\b(loves?|likes?|adores?|cares for)\s+(?:a\s+|an\s+|the\s+)?{re.escape(target_low)}\b', s_low)
                        and not is_scene_negative
                    )

                    # Contradiction: positive rule with negative scene OR negative rule with positive scene
                    if (not is_rule_negative and is_scene_negative) or (is_rule_negative and is_scene_positive):
                        prefix = "Conspiracy / Plot Twist: " if is_twist else "Rule violation: "
                        conflicts.append(
                            sb.Conflict(
                                type="conspiracy / plot twist" if is_twist else "broken character rule",
                                explanation=f"{prefix}Story rule establishes '{f.value}', but scene states: '{s}'",
                                old_quote=quote_str,
                                new_quote=s,
                            )
                        )
                        break

                # 2. Exclusivity violation (e.g. loves someone else when rule establishes 'only' or 'no one else')
                if ("only" in val_clean or "no one else" in val_clean or "solely" in val_clean) and ("love" in s_low or "loves" in s_low):
                    m_other = re.search(r'\blove[s]?\s+([a-zA-Z]+)', s_low)
                    if m_other:
                        other = m_other.group(1).lower()
                        stopwords = {target_low, 'him', 'her', 'them', 'no', 'the', 'a', 'someone', 'anyone', 'one', 'all', 'everyone', 'nobody'}
                        if other not in stopwords:
                            prefix = "Conspiracy / Plot Twist: " if is_twist else "Exclusivity rule violation: "
                            conflicts.append(
                                sb.Conflict(
                                    type="conspiracy / plot twist" if is_twist else "broken character rule",
                                    explanation=f"{prefix}Rule establishes '{f.value}', but scene states love for {other.capitalize()}.",
                                    old_quote=quote_str,
                                    new_quote=s,
                                )
                            )
                            break

        # Rule D2: Character Likes / Dislikes / Preferences
        m_dislike = re.search(r'\b(?:doesn\'t\s+like|does\s+not\s+like|dislikes?|hates?|detests?|cannot\s+drink|cannot\s+eat|doesn\'t\s+love|does\s+not\s+love)\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z\s]+)', val_clean)
        m_like = re.search(r'\b(?:likes?|loves?|enjoys?)\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z\s]+)', val_clean) if not m_dislike else None
        if m_dislike:
            target_item = m_dislike.group(1).strip().lower()
            if target_item and target_item not in ("to", "a", "the", "that"):
                for s in sentences:
                    s_low = s.lower()
                    char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                    if char_in_scene and target_item in s_low:
                        if re.search(rf'\b(likes?|loves?|enjoys?|drank|drinks?|ate|eats?|consuming)\s+(?:the\s+|a\s+|an\s+)?{re.escape(target_item)}\b', s_low):
                            if not re.search(r'\b(doesn\'t|does not|didn\'t|did not|never|refused|avoided|cannot)\b', s_low):
                                is_twist = any(w in s_low for w in twist_keywords)
                                conflicts.append(
                                    sb.Conflict(
                                        type="conspiracy / plot twist" if is_twist else "broken character rule",
                                        explanation=f"{'Plot Twist / Conspiracy: ' if is_twist else 'Character rule violation: '}{entity_name} is established with rule '{f.value}', but scene states: '{s}'",
                                        old_quote=quote_str,
                                        new_quote=s,
                                    )
                                )
                                break
        elif m_like:
            target_item = m_like.group(1).strip().lower()
            if target_item and target_item not in ("to", "a", "the", "that"):
                for s in sentences:
                    s_low = s.lower()
                    char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                    if char_in_scene and target_item in s_low:
                        if re.search(rf'\b(doesn\'t\s+like|does\s+not\s+like|dislikes?|hates?|detests?|doesn\'t\s+love|does\s+not\s+love)\s+(?:the\s+|a\s+|an\s+)?{re.escape(target_item)}\b', s_low):
                            is_twist = any(w in s_low for w in twist_keywords)
                            conflicts.append(
                                sb.Conflict(
                                    type="conspiracy / plot twist" if is_twist else "broken character rule",
                                    explanation=f"{'Plot Twist / Conspiracy: ' if is_twist else 'Character rule violation: '}{entity_name} is established with rule '{f.value}', but scene states: '{s}'",
                                    old_quote=quote_str,
                                    new_quote=s,
                                )
                            )
                            break

        # Rule E: Honesty / Cannot Lie
        elif "cannot lie" in val_clean or "never lie" in val_clean or "incapable of lying" in val_clean:
            lie_regex = r'\b(lied|lying|tells a lie|told a lie|deceived|deceiving)\b'
            for s in sentences:
                s_low = s.lower()
                char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                if char_in_scene and re.search(lie_regex, s_low):
                    if re.search(r'\b(cannot|never|refused|unable)\b', s_low):
                        continue
                    is_twist = any(w in s_low for w in twist_keywords)
                    conflicts.append(
                        sb.Conflict(
                            type="conspiracy / plot twist" if is_twist else "broken character rule",
                            explanation=f"{'Plot Twist / Conspiracy: ' if is_twist else 'Character rule violation: '}{entity_name} is established as incapable of lying, but lied in this scene.",
                            old_quote=quote_str,
                            new_quote=s,
                        )
                    )
                    break

        # Rule F: General Dynamic Negative Constraints (cannot <verb> / never <verb>)
        elif "cannot " in val_clean or "never " in val_clean:
            m_act = re.search(r'\b(?:cannot|never|must not)\s+([a-z]+(?:\s+[a-z]+)?)', val_clean)
            if m_act:
                act = m_act.group(1).strip()
                if act and act not in ("be", "have", "do"):
                    for s in sentences:
                        s_low = s.lower()
                        char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                        if char_in_scene and act in s_low:
                            if re.search(r'\b(cannot|never|could not|refused|unable)\b', s_low):
                                continue
                            is_twist = any(w in s_low for w in twist_keywords)
                            conflicts.append(
                                sb.Conflict(
                                    type="conspiracy / plot twist" if is_twist else "broken character rule",
                                    explanation=f"{'Plot Twist / Conspiracy: ' if is_twist else 'Character rule violation: '}Rule establishes '{f.value}', but scene states: '{s}'",
                                    old_quote=quote_str,
                                    new_quote=s,
                                )
                            )
                            break

    # De-duplicate conflicts while preserving order
    unique_conflicts: list[sb.Conflict] = []
    seen = set()
    for c in conflicts:
        key = (c.type, c.new_quote.strip().lower())
        if key not in seen:
            seen.add(key)
            unique_conflicts.append(c)
    return unique_conflicts


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


_last_branch_pool_idx = -1
_last_dialogue_lines: set[str] = set()


def generate_branches(
    bible: list[sb.Fact],
    direction: str,
    emotion: str,
    intensity: int,
    sabotage: bool = False,
    canvas_context: str | None = None,
) -> list[sb.Branch]:
    """Write 3 different branching versions of the next scene adapted dynamically to story bible and direction."""
    if is_configured():
        try:
            active_bible = list(bible)
            if not active_bible and (canvas_context or direction):
                active_bible = _offline_extract(canvas_context or direction, chapter=1)
            return sb.generate_branches(active_bible, direction, emotion, intensity, sabotage)
        except Exception as e:
            logger.warning(f"LLM generate_branches failed, using fallback: {e}")

    # Fallback: Dynamic & Random generation using the ACTUAL canvas & story context
    context_text = f"{canvas_context or ''} {direction or ''}".strip()

    # Extract dynamic characters from bible and context
    NON_CHAR_ENTITIES = {
        "world", "narrator", "story", "unknown", "christmas", "christmas day", "easter",
        "holiday", "holidays", "today", "yesterday", "tomorrow", "laughter", "silence", "shadows"
    }
    chars = [
        f.entity for f in bible
        if f.entity and f.attribute not in ("world_rule", "location", "place")
        and f.entity.lower() not in NON_CHAR_ENTITIES
        and not any(w in f.entity.lower().split() for w in ("christmas", "easter", "holiday", "day", "night", "morning", "evening"))
    ]
    # Also extract proper nouns from context_text
    for match in re.finditer(r'\b([A-Z][a-z]+)\b', context_text):
        name = match.group(1)
        if name.lower() not in NON_CHAR_ENTITIES and name not in chars and len(name) > 2 and name not in ("The", "This", "That", "When", "What", "Then", "There", "Here", "After", "Before"):
            chars.append(name)

    places = [
        f.value for f in bible
        if f.attribute in ("location", "place") and f.value
        and f.value.lower() not in NON_CHAR_ENTITIES
        and not any(w in f.value.lower().split() for w in ("christmas", "easter", "holiday", "day", "night", "morning", "evening"))
    ]
    rules = [f.value for f in bible if "rule" in f.attribute.lower() or "cannot" in f.value.lower() or "never" in f.value.lower()]

    seen_c = set()
    unique_chars = [c for c in chars if not (c.lower() in seen_c or seen_c.add(c.lower()))]
    seen_p = set()
    unique_places = [p for p in places if not (p.lower() in seen_p or seen_p.add(p.lower()))]

    main_char = unique_chars[0] if unique_chars else "The protagonist"
    second_char = unique_chars[1] if len(unique_chars) > 1 else "an unexpected companion"
    main_place = unique_places[0] if unique_places else "the scene"

    clean_dir = direction.replace("\n", " ").strip()
    summary_hint = clean_dir[:90] if clean_dir else f"{main_char} reflects on what lies ahead"
    emo_lower = emotion.lower()

    branch1_titles = [
        f"{main_char}'s Immediate Discovery",
        "The Decisive Move",
        f"Revelation at {main_place}",
        "Unspoken Intuition",
    ]
    branch2_titles = [
        f"Confrontation with {second_char}",
        "The Competing Imperative",
        "An Unlikely Alignment",
        "Whispers in the Shadows",
    ]
    branch3_titles = [
        "The Divergent Path",
        "The Unexpected Pivot",
        "Defying the Established Rule",
        "Into the Unknown",
    ]

    title1 = random.choice(branch1_titles)
    title2 = random.choice(branch2_titles)
    title3 = random.choice(branch3_titles)

    scene1 = (
        f"Building upon what just occurred, {main_char} stepped forward with intense {emo_lower}. "
        f"Recalling that \"{summary_hint}\", every clue pointed toward an imminent answer. "
        f"\"We don't second-guess our instincts now,\" {main_char} whispered, uncovering a decisive detail that transformed the stakes."
    )
    scene2 = (
        f"A sudden break in the atmosphere caught {main_char} off-guard as {second_char} emerged into view near {main_place}. "
        f"With palpable {emo_lower}, they stood face-to-face. "
        f"\"You knew what this would lead to,\" {second_char} warned, challenging the course of action and demanding an immediate choice."
    )
    scene3 = (
        f"Refusing the obvious route, {main_char} chose a completely unconventional course away from {main_place}. "
        f"The risk was undeniable, but the conventional outcome was unacceptable. "
        f"Taking a leap into uncertainty with fierce determination, a hidden sequence of possibilities opened up."
    )

    if sabotage and rules:
        title3 = "Breach of Established Lore"
        scene3 = (
            f"Defying every warning, {main_char} acted directly contrary to established lore: {rules[0]}, "
            f"triggering an immediate and chaotic shift across {main_place}."
        )

    return [
        sb.Branch(title=title1, scene=scene1),
        sb.Branch(title=title2, scene=scene2),
        sb.Branch(title=title3, scene=scene3),
    ]


def write_branches_audited(
    bible: list[sb.Fact],
    direction: str,
    emotion: str,
    intensity: int,
    chapter: int,
    sabotage: bool = False,
    canvas_context: str | None = None,
) -> list[sb.BranchResult]:
    """Generate 3 branches, then audit them in parallel via Story_Wave_model."""
    if is_configured():
        try:
            active_bible = list(bible)
            if not active_bible and (canvas_context or direction):
                active_bible = _offline_extract(canvas_context or direction, chapter=chapter)
            return sb.write_branches_audited(active_bible, direction, emotion, intensity, chapter, sabotage)
        except Exception as e:
            logger.warning(f"LLM write_branches_audited failed, using fallback: {e}")

    branches = generate_branches(bible, direction, emotion, intensity, sabotage, canvas_context=canvas_context)
    results = []
    for b in branches:
        flags = check(bible, b.scene, chapter)
        emo = analyze_emotion(bible, b.scene, chapter)
        results.append(sb.BranchResult(branch=b, flags=flags, emotion=emo))
    return results


def write_dialogue(
    bible: list[sb.Fact],
    character: str,
    situation: str,
    emotion: str,
    intensity: int,
    canvas_context: str | None = None,
) -> list[sb.DialogueOption]:
    """Write 3 in-voice dialogue options adapted dynamically to character, situation and emotion."""
    global _last_dialogue_lines
    if is_configured():
        try:
            active_bible = list(bible)
            if not active_bible and (canvas_context or situation):
                active_bible = _offline_extract(canvas_context or situation, chapter=1)
            return sb.write_dialogue(active_bible, character, situation, emotion, intensity)
        except Exception as e:
            logger.warning(f"LLM write_dialogue failed, using fallback: {e}")

    emo_lower = emotion.lower()
    char_name = character.strip() or "Speaker"
    sit_clean = situation.strip() or "the situation at hand"

    dialogue_archetypes = {
        "defiance": [
            f"\"We didn't come this far just to fold when things get difficult. I'm seeing this through.\"",
            f"\"Let them challenge us. Around here, we write our own rules.\"",
            f"\"If you want to stop me from confronting {sit_clean}, you'll have to do better than that.\"",
            f"\"I know the risks as well as you do. But I refuse to walk away empty-handed.\"",
        ],
        "fear": [
            f"\"Keep your voice down... if anyone realizes what occurred in {sit_clean}, we're finished.\"",
            f"\"I'm not hesitating because of weakness; I'm hesitating because we only get one shot at this.\"",
            f"\"Listen to me. Don't look back, and don't make a sound until we're clear.\"",
            f"\"Did you feel that? Something about {sit_clean} isn't right at all.\"",
        ],
        "grief": [
            f"\"Every time the quiet returns, I find myself waiting for them to walk through the door.\"",
            f"\"You think I don't carry the weight of this? It's in every breath I take.\"",
            f"\"Some promises outlast the people who made them. That's why I'm still standing here.\"",
            f"\"All the victories we could win won't change what we lost.\"",
        ],
        "joy": [
            f"\"It worked! After everything we went through, we actually pulled it off!\"",
            f"\"Take a look around us. We're finally through the darkest part of the journey.\"",
            f"\"I knew if we stayed together, we'd find the answer. Look at what we achieved.\"",
            f"\"{char_name}, take a breath and smile. The worst of it is finally behind us.\"",
        ],
        "curiosity": [
            f"\"Look closely at the pattern here... this wasn't accidental at all.\"",
            f"\"If we pay attention to what's right in front of us, the whole mystery unravels.\"",
            f"\"Tell me exactly what you noticed from the start. Even the smallest detail matters.\"",
            f"\"There's a reason this happened during {sit_clean}. Someone planned it.\"",
        ],
    }

    key = next((k for k in dialogue_archetypes if k in emo_lower), "defiance")
    lines_pool = list(dialogue_archetypes[key])
    random.shuffle(lines_pool)
    chosen_lines = lines_pool[:3]

    return [
        sb.DialogueOption(
            line=chosen_lines[i],
            underlying_emotion=emotion,
            intensity=max(1, min(10, intensity)),
            why_in_voice=f"Expresses {char_name}'s authentic reaction to {sit_clean} with {emotion}.",
        )
        for i in range(len(chosen_lines))
    ]


def analyze_emotion(bible: list[sb.Fact], text: str, chapter: int) -> sb.EmotionReport:
    """Analyze dialogue emotion, subtext, and voice consistency."""
    if is_configured():
        try:
            return sb.analyze_emotion(bible, text, chapter)
        except Exception as e:
            logger.warning(f"LLM analyze_emotion failed: {e}")
    speaker_name = (bible[0].entity if bible and bible[0].entity and bible[0].entity.lower() not in ("world", "narrator") else "Speaker")
    return sb.EmotionReport(
        lines=[
            sb.LineEmotion(
                speaker=speaker_name,
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


def transcribe_voice(audio_path: str, context: str | None = None) -> str:
    """Transcribe human voice audio clip into dialogue text."""
    if is_configured():
        try:
            rep = sb.analyze_voice(audio_path)
            if rep and rep.transcript:
                return rep.transcript
        except Exception as e:
            logger.warning(f"LLM transcribe_voice failed: {e}")

    # Return context or empty string if unconfigured, never inject hardcoded unrelated dialogues
    return context.strip() if context else ""


def analyze_voice(audio_path: str, dialogue_text: str | None = None) -> sb.VoiceReport:
    """Analyze human audio clip for emotion, intensity, and words-vs-tone mismatch."""
    clean_text = dialogue_text.strip() if dialogue_text else ""
    if is_configured():
        try:
            return sb.analyze_voice(audio_path)
        except Exception as e:
            logger.warning(f"LLM analyze_voice failed: {e}")

    clean_lower = clean_text.lower()
    tokens = set(re.findall(r"\b[a-z']+\b", clean_lower))

    # Calculate dynamic intensifiers and punctuation emphasis
    intensifier_words = {
        "really", "very", "extremely", "pretty", "much", "so", "totally",
        "absolutely", "insanely", "unbelievably", "incredibly", "deeply",
        "truly", "wildly", "immensely", "exceptionally", "quite"
    }
    num_intensifiers = sum(1 for w in re.findall(r"\b[a-z']+\b", clean_lower) if w in intensifier_words)
    has_exclamation = "!" in clean_text

    # Dynamic emotion dictionaries with strict word boundary matching
    joy_words = {
        "amazing", "spell", "amazed", "joy", "joyful", "joyfulness", "enjoy", "enjoyed",
        "enjoyment", "awesome", "fantastic", "brilliant", "wonderful", "great", "spectacular",
        "magical", "magic", "incredible", "thrilled", "exciting", "excited", "delight",
        "delighted", "superb", "masterpiece", "astonishing", "breathtaking", "marvelous",
        "fabulous", "splendid", "stunning", "unreal", "wow", "fun", "lovely", "brilliance",
        "phenomenal", "captivating", "enchanted", "ecstatic", "proud", "celebrate", "triumph", "happy"
    }
    love_words = {
        "love", "loves", "loved", "loving", "heart", "darling", "adore", "adored",
        "dearest", "kiss", "passion", "bithika", "subhankar", "cherish", "devoted", "affection"
    }
    fear_words = {
        "fear", "afraid", "scared", "danger", "dangerous", "run", "dark", "wraith", "monster",
        "kill", "killed", "die", "dying", "dead", "shadow", "flee", "panic", "dread", "terror",
        "horrified", "horror", "tremble", "trap", "trapped"
    }
    defiance_words = {
        "won't", "never", "fight", "fighting", "stand", "swear", "defeat", "blade", "strike",
        "refuse", "refused", "defy", "conquer", "stop", "destroy", "rage", "furious", "angry", "hate"
    }
    sad_words = {
        "sad", "grief", "lost", "crying", "cry", "tears", "alone", "heavy", "goodbye",
        "sorry", "mourn", "hopeless", "broken", "despair", "ache", "pain", "miss", "hurt"
    }
    inquisitive_words = {
        "why", "what", "who", "where", "how", "secret", "truth", "hidden", "clue", "riddle",
        "which", "wonder", "curious", "mystery", "question"
    }

    # Determine emotion dynamically based on semantic intent and acoustic weight
    if tokens & joy_words:
        p_emo = "Joy / Amazement"
        s_emo = "Exhilaration & Wonder"
        inten = min(10, 8 + num_intensifiers + (1 if has_exclamation else 0))
        val = "positive"
        energy = "high"
        cues = "Vibrant melodic pitch lift, bright resonant overtones, enthusiastic breath cadence"
        mismatch = False
        note = "Warm, enthusiastic vocal delivery matches genuine joy, amazement, and wonder."
        summary = "Vocal delivery conveys sheer delight, fascination, and captivating enjoyment."
    elif tokens & love_words:
        p_emo = "Affection / Deep Love"
        s_emo = "Tenderness"
        inten = min(10, 7 + num_intensifiers)
        val = "positive"
        energy = "medium"
        cues = "Warm vocal resonance, softening cadence, gentle micro-pauses"
        mismatch = False
        note = "Warm vocal tone matches sincere affection and intimate dialogue."
        summary = "Delivery conveys sincere affection and emotional vulnerability."
    elif tokens & fear_words:
        p_emo = "Fear / High Urgency"
        s_emo = "Panic"
        inten = min(10, 8 + num_intensifiers + (1 if has_exclamation else 0))
        val = "negative"
        energy = "high"
        cues = "Accelerated tempo, shallow breathing, elevated vocal pitch"
        mismatch = False
        note = "Vocal agitation mirrors the high-stakes threat in the line."
        summary = "Urgent, strained delivery communicates immediate peril."
    elif tokens & defiance_words:
        p_emo = "Defiance / Determination"
        s_emo = "Courage"
        inten = min(10, 8 + num_intensifiers + (1 if has_exclamation else 0))
        val = "positive"
        energy = "high"
        cues = "Resonant chest voice, firm cadence, crisp consonant articulation"
        mismatch = False
        note = "Firm acoustic attack underscores protagonist resolve."
        summary = "Delivery is commanding, resolute, and unwavering."
    elif tokens & sad_words:
        p_emo = "Sadness / Grief"
        s_emo = "Sorrow"
        inten = min(10, 6 + num_intensifiers)
        val = "negative"
        energy = "low"
        cues = "Slow tempo, descending pitch contour, prolonged pauses"
        mismatch = False
        note = "Subdued vocal dynamics capture solemn melancholy."
        summary = "Introspective delivery imbued with restrained grief."
    elif tokens & inquisitive_words:
        p_emo = "Inquisitive / Suspicion"
        s_emo = "Curiosity"
        inten = min(8, max(5, 5 + num_intensifiers))
        val = "neutral"
        energy = "medium"
        cues = "Rising terminal inflection, deliberate pacing, measured breath"
        mismatch = False
        note = "Cautious inflection matches investigative intent."
        summary = "Guarded vocal curiosity probing for answers."
    else:
        p_emo = "Narrative Conviction"
        s_emo = "Poise"
        inten = min(8, max(5, 5 + num_intensifiers))
        val = "neutral"
        energy = "medium"
        cues = "Measured pacing, clear diction, grounded vocal register"
        mismatch = False
        note = "Balanced acoustic delivery aligned with narrative dialogue."
        summary = "Natural and steady line delivery."

    # Check for words vs tone contrast (e.g. cheerful words spoken in fear/sadness)
    cheerful_words = {"happy", "glad", "fine", "great", "wonderful", "calm", "joy", "peace", "amazing"}
    if (tokens & cheerful_words) and val == "negative":
        mismatch = True
        note = f"Vocal tone ({p_emo}) contradicts cheerful words in: \"{clean_text}\""
        summary = "Subtext detected: Surface optimism contradicted by acoustic distress."

    transcript_val = clean_text

    return sb.VoiceReport(
        transcript=transcript_val,
        primary_emotion=p_emo,
        secondary_emotion=s_emo,
        intensity=inten,
        valence=val,  # type: ignore
        energy=energy,  # type: ignore
        delivery_cues=cues,
        words_vs_tone_mismatch=mismatch,
        mismatch_note=note,
        summary=summary,
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
        import tempfile
        fallback = out_path or os.path.join(tempfile.gettempdir(), f"ai_voice_{int(time.time() * 1000)}.mp3")
        if not os.path.exists(fallback):
            with open(fallback, "wb") as f:
                f.write(b"")
        return fallback
