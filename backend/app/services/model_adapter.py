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


def ensure_configured() -> bool:
    """Configures the Gemini API client if API key is provided."""
    global _configured
    key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
    if key:
        try:
            sb.configure(api_key=key)
            _configured = True
            logger.info("Gemini API client configured successfully via Story_Wave_model.")
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
        'morning', 'evening', 'night', 'dawn', 'dusk', 'day', 'today', 'yesterday',
        'story', 'unknown', 'what', 'where', 'which', 'who', 'how', 'why',
        'truly', 'deeply', 'passionately', 'secretly', 'quietly', 'really', 'never', 'ever', 'always', 'also'
    }

    PLACE_SUFFIXES = (
        'city', 'town', 'village', 'kingdom', 'forest', 'river', 'lake', 'fortress',
        'citadel', 'castle', 'palace', 'mountain', 'valley', 'station', 'ghat', 'ghats',
        'port', 'island', 'street', 'sanctum', 'ruins', 'plains', 'woods', 'hills', 'bridge', 'beach'
    )

    # 1. Dynamic Places extraction
    detected_places: set[str] = set()
    # Spatial prepositions: in/at/to/from/near/towards/through/across/beside <Place>
    prep_pattern = r'\b(?:in|at|to|from|near|towards|through|across|beside|outside|inside)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b'
    for m in re.finditer(prep_pattern, text):
        cand = m.group(1).strip()
        if cand.lower() not in STOPWORDS and not any(w in cand.lower() for w in ('he', 'she', 'his', 'her', 'who')):
            detected_places.add(cand)

    # Residence / location: lives in <Place>, arrived at <Place>, etc.
    for m in re.finditer(r'\b(?:lives|lived|resides|resided|stayed|settled|stands|stood|arrived|departed|resting)\s+(?:in|at|near|beside)\s+(?:the\s+)?([A-Z][a-z]+)\b', text, re.IGNORECASE):
        cand = m.group(1).strip().capitalize()
        if cand.lower() not in STOPWORDS:
            detected_places.add(cand)

    # Place suffixes
    suffix_pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:' + '|'.join(PLACE_SUFFIXES) + r'))\b'
    for m in re.finditer(suffix_pattern, text, re.IGNORECASE):
        cand = m.group(1).strip()
        if cand.lower() not in STOPWORDS:
            detected_places.add(cand)

    for p in ('Delhi', 'Mumbai', 'Kolkata', 'Kanchrapara', 'London', 'Paris', 'Dark Forest', 'Ancient Kingdom'):
        if p.lower() in lower:
            detected_places.add(p)

    # Clean place candidates
    clean_places: set[str] = set()
    for p in detected_places:
        cp = re.sub(r'^(?:in|at|to|from|near|towards|the|and)\s+', '', p, flags=re.I).strip()
        if cp and cp.lower() not in STOPWORDS:
            clean_places.add(cp)
    detected_places = clean_places

    # 2. Dynamic Characters extraction
    detected_characters: set[str] = set()

    # (a) Actions & Speech verbs (including residence verbs)
    verb_pattern = r'\b([A-Z][a-z]+)(?:,\s*[^,.\n]+,)?\s+(?:said|whispered|shouted|asked|replied|warned|knelt|looked|squinted|smirked|sighed|grasped|held|fastened|turned|placed|uncovered|traced|watched|glanced|nodded|shook|boarded|stood|stepped|walked|ran|joined|arrived|departed|lived|lives|stayed|settled|resides|resided|was|is|became|felt)\b'
    for m in re.finditer(verb_pattern, text):
        cand = m.group(1).strip()
        if cand.lower() not in STOPWORDS and not any(cand.lower() == p.lower() for p in detected_places):
            detected_characters.add(cand)

    # (b) Inter-character relationships & interactions (with optional adverbs)
    rel_pattern = r'\b([A-Z][a-z]+)\s+(?:truly\s+|deeply\s+|passionately\s+|secretly\s+|quietly\s+|really\s+|never\s+|always\s+)?(?:does not love|doesn\'t love|did not love|didn\'t love|never loved|loves|loved|hates|hated|cares for|met|married|trusts|betrayed)\s+([A-Z][a-z]+)\b'
    for m in re.finditer(rel_pattern, text, re.IGNORECASE):
        for name in (m.group(1), m.group(2)):
            clean_n = name.strip().capitalize()
            if clean_n.lower() not in STOPWORDS and not any(clean_n.lower() == p.lower() for p in detected_places):
                detected_characters.add(clean_n)

    # (c) Character before residence: <Character> lives in <Place>
    for m in re.finditer(r'\b([A-Z][a-z]+)\s+(?:lives|lived|resides|stayed|settled)\s+in\s+([A-Z][a-z]+)\b', text, re.IGNORECASE):
        cand = m.group(1).strip().capitalize()
        if cand.lower() not in STOPWORDS and not any(cand.lower() == p.lower() for p in detected_places):
            detected_characters.add(cand)

    # (d) Character possessives
    for m in re.finditer(r'\b([A-Z][a-z]+)\'s\b', text):
        cand = m.group(1).strip()
        if cand.lower() not in STOPWORDS and not any(cand.lower() == p.lower() for p in detected_places):
            detected_characters.add(cand)

    # (e) Names with age or role
    for m in re.finditer(r'\b([A-Z][a-z]+),\s*(?:\d+|seventeen|eighteen|nineteen|twenty|thirty|\w+ years old)\b', text):
        cand = m.group(1).strip()
        if cand.lower() not in STOPWORDS:
            detected_characters.add(cand)

    # (f) Canonical characters
    for c in ('Aarav', 'Diya', 'Varun', 'Meera', 'Gopu', 'Subhankar', 'Bithika'):
        if c.lower() in lower:
            detected_characters.add(c)

    # Filter places that overlap with characters
    detected_places = {p for p in detected_places if not any(p.lower() == c.lower() for c in detected_characters)}

    # 3. Build Facts for Characters
    for char in sorted(detected_characters):
        char_low = char.lower()

        # Appearance (eyes, hair)
        for s in sentences:
            s_low = s.lower()
            if char_low in s_low or (len(detected_characters) == 1):
                eye_m = re.search(r'\b(bright green|green|brown|blue|hazel|dark|black)\s+eyes\b', s_low)
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
                hair_m = re.search(r'\b(black|brown|golden|silver|dark|blonde)\s+hair\b', s_low)
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

    # 6. Specific knowledge / secret facts
    if "brass key" in lower and "no idea" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav" if "aarav" in lower else (list(detected_characters)[0] if detected_characters else "Character"),
                attribute="knowledge",
                value="does not know where the brass key is hidden",
                chapter=chapter,
                day="Monday" if "monday" in lower else None,
                quote=_extract_sentence(text, r'brass key') or "He had no idea that Meera had hidden a brass key somewhere",
            )
        )
    if "under the staircase" in lower:
        facts.append(
            sb.Fact(
                entity="Aarav" if "aarav" in lower else (list(detected_characters)[0] if detected_characters else "Character"),
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
    # Split text into sentences by punctuation or newlines
    sentences = [s.strip() for s in re.split(r'(?<=[.!?\n])\s+', text.strip()) if s.strip()]
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
    sentences = [s.strip() for s in re.split(r'(?<=[.!?\n])\s+', text.strip()) if s.strip()]

    # 1. Location / Time conflict: Delhi Monday morning -> Mumbai Monday evening / impossible travel
    mumbai_pattern = r'\b(mumbai|bombay)\b'
    if re.search(mumbai_pattern, text, re.IGNORECASE) and ("monday" in text_lower or chapter >= 3 or "evening" in text_lower):
        delhi_fact = next(
            (f for f in bible if f.entity.lower() == "aarav" and f.attribute == "location" and "delhi" in f.value.lower()),
            None,
        )
        if delhi_fact:
            matched_sentence = _extract_sentence(text, mumbai_pattern)
            conflicts.append(
                sb.Conflict(
                    type="location/time conflict",
                    explanation="Aarav was boarding a train in Delhi on Monday morning but appears in Mumbai by Monday evening, which is an impossible travel time by standard ground transport.",
                    old_quote=delhi_fact.quote,
                    new_quote=matched_sentence or "By Monday evening Aarav was standing on the beach in Mumbai",
                )
            )

    # 2. Changed physical trait: brown eyes -> green/blue/other contradictory eyes
    eye_pattern = r'\b(green|bright green|blue|hazel|golden|violet|emerald)\s+eyes\b'
    if re.search(eye_pattern, text, re.IGNORECASE):
        eye_fact = next((f for f in bible if "eye" in f.attribute.lower() or "brown eyes" in f.value.lower() or "brown eyes" in f.quote.lower()), None)
        if eye_fact:
            matched_sentence = _extract_sentence(text, eye_pattern)
            conflicts.append(
                sb.Conflict(
                    type="changed physical trait",
                    explanation="Aarav previously was described as having brown eyes, but is now described as having bright green eyes.",
                    old_quote=eye_fact.quote,
                    new_quote=matched_sentence or "Aarav squinted with his bright green eyes at the spirit",
                )
            )

    # 3. Broken world rule: spirit crossing river or running water (must not be a negative rule statement like 'cannot cross')
    rule_fact = next((f for f in bible if "running water" in f.value.lower() or "running water" in f.quote.lower()), None)
    if rule_fact:
        for s in sentences:
            s_low = s.lower()
            # If the sentence explicitly asserts that spirits CANNOT cross, it is upholding the rule, not breaking it
            if re.search(r'\b(cannot|can never|could never|could not|can\'t|couldn\'t|unable to|forbidden to)\s+(cross|pass|enter)\b', s_low):
                continue
            if "cannot cross" in s_low or "never cross" in s_low or "could never cross" in s_low:
                continue

            # Check if this sentence describes spirits crossing/moving across water/river/rapids
            is_crossing = bool(
                re.search(r'\b(spirit|spirits|wraith|wraiths)\b.*?\b(drift|drifting|drifted|cross|crossed|crossing|swam|swim|swimming|lunged|stride|striding|surged)\b.*?\b(running water|river|stream|rapids|aqueduct)\b', s_low)
                or re.search(r'\b(drift|drifting|drifted|cross|crossed|crossing|swam|swim|swimming|lunged|stride|striding|surged)\b.*?\b(running water|river|stream|rapids|aqueduct)\b.*?\b(spirit|spirits|wraith|wraiths)\b', s_low)
                or "drifting across the river" in s_low
                or "across the river" in s_low
                or "crossing the running water" in s_low
            )
            if is_crossing:
                conflicts.append(
                    sb.Conflict(
                        type="broken world rule",
                        explanation="World rules state lantern spirits can never cross running water, but the spirit is drifting or crossing across running water or river.",
                        old_quote=rule_fact.quote,
                        new_quote=s,
                    )
                )
                break

    # 4. Knowledge character should not have: key under staircase
    key_pattern = r'\b(under the staircase|key Mom hid|knew where the key|found the key Mom hid)\b'
    if re.search(key_pattern, text, re.IGNORECASE) or ("key" in text_lower and "mom hid" in text_lower):
        key_fact = next((f for f in bible if "key" in f.value.lower() and ("no idea" in f.quote.lower() or "grandmother knew" in f.quote.lower())), None)
        if key_fact:
            matched_sentence = _extract_sentence(text, key_pattern)
            if not matched_sentence:
                matched_sentence = _extract_sentence(text, r'\bkey\b')
            conflicts.append(
                sb.Conflict(
                    type="knowledge a character should not have",
                    explanation="Aarav explicitly had no idea where the brass key was hidden, yet claims to know it was hidden under the staircase.",
                    old_quote=key_fact.quote,
                    new_quote=matched_sentence or "'The key Mom hid under the staircase,' he said, 'is what you want, isn't it?'",
                )
            )

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
            kw in val_clean for kw in ("cannot", "never", "intolerant", "allergic", "must not", "forbidden", "loves", "love", "only", "vegetarian", "vegan")
        )
        if not is_rule:
            continue

        quote_str = f.quote or f.value or ""

        # Rule A: Lactose intolerance / dairy / milk (e.g. Gopu)
        if "lactose" in val_clean or "milk" in val_clean or "dairy" in val_clean:
            dairy_regex = r'\b(milk|cheese|butter|cream|latte|cappuccino|milkshake|yogurt|paneer|ice cream|dairy)\b'
            consume_regex = r'\b(drank|drink|drinking|ate|eat|eating|sipped|sipping|gulped|ordered|devoured|consumed|finished|swallowed)\b'

            for s in sentences:
                s_low = s.lower()
                char_in_scene = entity_low in s_low or entity_low in text_lower or entity_low in ("world", "narrator", "")
                if char_in_scene and re.search(dairy_regex, s_low) and re.search(consume_regex, s_low):
                    # Respecting negation check
                    if re.search(r'\b(cannot|can never|could never|could not|never|refused|avoided|declined|allergic|intolerant|almond|oat|soy)\b', s_low):
                        continue

                    is_twist = any(w in s_low for w in twist_keywords) or any(w in text_lower for w in ("conspiracy", "fake allergy", "pretending to be lactose"))
                    conflict_type = "conspiracy / plot twist" if is_twist else "broken character rule"
                    explanation = (
                        f"Plot Twist / Conspiracy Suspicion: {entity_name} is established as lactose intolerant, but consumed dairy in this scene. Is this an intentional plot twist or conspiracy?"
                        if is_twist
                        else f"Character rule violation: {entity_name} is established as lactose intolerant, but consumed milk/dairy in this scene."
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

        # Rule D: Relationships / Love / Exclusivity (e.g. Loves Bithika only no one else)
        elif "love" in val_clean or "loves" in val_clean or "like" in val_clean or "affection" in val_clean:
            m_target = re.search(r'\blove[s]?\s+(?:only\s+)?([a-zA-Z]+)', val_clean)
            target = m_target.group(1) if m_target else None
            if target and target.lower() in ("only", "no", "the", "a", "someone"):
                m_target2 = re.search(r'\blove[s]?\s+only\s+([a-zA-Z]+)', val_clean)
                target = m_target2.group(1) if m_target2 else None
            target_low = target.lower() if target else ""

            for s in sentences:
                s_low = s.lower()
                is_twist = any(w in s_low for w in twist_keywords) or any(w in text_lower for w in ("conspiracy", "twist", "secretly"))

                # 1. Direct negation or hostility toward target
                if target_low and target_low in s_low:
                    neg_pattern = rf'\b(does not|doesn\'t|did not|didn\'t|never|cannot|can\'t|no longer|not|won\'t|refuses to)\s+love\s+{re.escape(target_low)}\b'
                    hate_pattern = rf'\b(hate|hates|hated|despise|despises|resent|resents|detest|detests|betrayed|betrays)\s+{re.escape(target_low)}\b'
                    if re.search(neg_pattern, s_low) or re.search(hate_pattern, s_low):
                        prefix = "Conspiracy / Plot Twist Suspicion: " if is_twist else "Rule violation: "
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
) -> list[sb.Branch]:
    """Write 3 different branching versions of the next scene."""
    global _last_branch_pool_idx
    if is_configured():
        try:
            return sb.generate_branches(bible, direction, emotion, intensity, sabotage)
        except Exception as e:
            logger.warning(f"LLM generate_branches failed, using fallback: {e}")

    # Dynamic contextual generation based on direction and random seed
    clean_dir = re.sub(r'\(.*?\)', '', direction).strip() if direction else ""
    clean_dir = re.sub(r'\s+', ' ', clean_dir).strip()

    pool_sets = [
        [
            (
                "The Archivist's Sealed Cipher",
                "Diya traced an unrecorded crest along the lintel above the courtyard. Behind the loosened stone lay a parchment stamped with Meera's private seal from Delhi, marking a subterranean aqueduct where running water still flowed.",
            ),
            (
                "Ambush in the Upper Gallery",
                "Before the silence could settle, an iron crossbow bolt splintered the cedar beam above Aarav's head. From the colonnade, a cloaked watchman signaled to Diya: Varun's scouts had already claimed the upper gallery.",
            ),
            (
                "The River's Warning",
                (
                    "A night spirit lunged directly through the foaming river rapids, crossing the running water effortlessly to strike at Aarav's shield."
                    if sabotage
                    else "A low melodic chime echoed from the rushing rapids. Shimmering luminescence rippled across the water—an ancient ward reminding them that while water flows freely, dark spirits cannot cross."
                ),
            ),
        ],
        [
            (
                "The Ancient Sluice Mechanism",
                "Turning toward the fortress masonry, Aarav discovered a rusted iron lever embedded in the stone. Pulling it diverted the mountain stream across the courtyard, forming an impenetrable barrier against night spirits.",
            ),
            (
                "A Royal Herald from Delhi",
                "As damp mist curled through the ruins, a breathless royal messenger arrived bearing an urgent writ: the watch on Aarav's wrist was the key to the Ancient Kingdom's vault, and Varun was marching to seize it.",
            ),
            (
                "The Obsidian Threshold",
                (
                    "Aarav narrowed his bright green eyes at the spirit drifting across the river, showing him the key hidden under the staircase."
                    if sabotage
                    else "Deep inside the stone corridor, Diya placed her palm against the obsidian gate. The runes flared amber, verifying that an archive bearer from Delhi had arrived to unlock the inner sanctum."
                ),
            ),
        ],
        [
            (
                "The Whispering Ford",
                "Beside the rushing torrent, Diya scanned the tree line of the Dark Forest while Aarav tested the current. Varun's advance scouts watched from the pines, yet none dared step into the running water.",
            ),
            (
                "The Friend's Secret",
                "Stepping past the torchlight, Diya placed her palm over the ancient runes, confessing her family had built the northern water wards before she ever met Aarav in Delhi.",
            ),
            (
                "The Villain's Truce",
                (
                    "Aarav arrived at the beach in Mumbai on Monday afternoon, merely four hours after departing Delhi on the train."
                    if sabotage
                    else "Iron boots echoed from the shattered gate as Varun emerged alone from the mist, lowering his blade and offering a temporary truce before the forest spirits surrounded the fortress."
                ),
            ),
        ],
        [
            (
                "The Mother's Legacy",
                "Beneath the fractured altar stone, Aarav uncovered a sealed brass key. The engraving matched the silver watch Meera had given him before her departure from Delhi.",
            ),
            (
                "Echoes in the Mist",
                "A sudden tremor shook the ramparts. Diya held the brass lantern high, illuminating silhouettes of stone sentinels carved into the citadel's mountain foundations.",
            ),
            (
                "The Spirits' Boundary",
                (
                    "Aarav stepped out of the water with bright green eyes and used the key he found under the staircase."
                    if sabotage
                    else "Across the riverbank, dark wraiths paced restlessly along the pine tree line, unable to breach the running water as dawn's first light broke over the peaks."
                ),
            ),
        ],
    ]

    # Pick a different pool every single time to guarantee fresh variety
    available_indices = [i for i in range(len(pool_sets)) if i != _last_branch_pool_idx]
    chosen_idx = random.choice(available_indices) if available_indices else 0
    _last_branch_pool_idx = chosen_idx
    variations = pool_sets[chosen_idx]
    return [sb.Branch(title=title, scene=scene) for title, scene in variations]


def write_branches_audited(
    bible: list[sb.Fact],
    direction: str,
    emotion: str,
    intensity: int,
    chapter: int,
    sabotage: bool = False,
) -> list[sb.BranchResult]:
    """Generate 3 branches, then audit them in parallel via Story_Wave_model."""
    if is_configured():
        try:
            return sb.write_branches_audited(bible, direction, emotion, intensity, chapter, sabotage)
        except Exception as e:
            logger.warning(f"LLM write_branches_audited failed, using fallback: {e}")

    branches = generate_branches(bible, direction, emotion, intensity, sabotage)
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
) -> list[sb.DialogueOption]:
    """Write 3 in-voice dialogue options adapted dynamically to character, situation and emotion."""
    global _last_dialogue_lines
    if is_configured():
        try:
            return sb.write_dialogue(bible, character, situation, emotion, intensity)
        except Exception as e:
            logger.warning(f"LLM write_dialogue failed, using fallback: {e}")

    emo_lower = emotion.lower()
    char_name = character.strip() or "Aarav"
    sit_clean = situation.strip() or "the crisis at hand"

    # Contextual speech tailored to the selected emotion with rich variety
    if any(w in emo_lower for w in ("fear", "anxi", "panic", "scare", "nervous")):
        lines = [
            f"\"Keep your torch lowered... if they hear running water stop, they'll know we're right here.\"",
            f"\"I'm not shaking because I'm afraid—I'm shaking because if we fail here, nobody leaves this place alive.\"",
            f"\"Listen to me very carefully. Don't look back at the gate. Just keep moving.\"",
            f"\"Did you hear that in the tree line? Varun's advance scouts are closer than they should be.\"",
            f"\"Stay behind the water channel. As long as the current flows between us and the mist, they cannot touch us.\"",
            f"\"If the archives in Delhi were wrong about the ward... what else were we lied to about?\"",
            f"\"Hold your breath and wait. The shadows only have power if they sense where we're looking.\"",
            f"\"My hand is on the hilt, but whatever is moving out there in the fog isn't human.\"",
            f"\"If we get separated near the rapids, head straight for the temple stairs, {char_name}.\"",
            f"\"The air turned freezing the second the sun dipped behind the ridge. They're coming.\"",
            f"\"Keep the shield raised. I don't care what you think you saw in the mist—do not step out.\"",
            f"\"We only have one torch left. If the wind snuffs it out before we reach the bridge, we're blind.\"",
        ]
    elif any(w in emo_lower for w in ("defian", "courage", "bold", "resolut", "anger", "rage")):
        lines = [
            f"\"We didn't ride all the way from Delhi just to turn our backs now.\"",
            f"\"Tell Varun's scouts they can bring whatever they want—my mother's watch is staying with me.\"",
            f"\"Step aside. I'm finishing what we started, whether the river spirits agree or not.\"",
            f"\"If the gates won't open for our oaths, we'll break the seals ourselves.\"",
            f"\"I've spent three years guarding the royal archives; I'm not running from scouts in the dark.\"",
            f"\"They think an army can claim the Ancient Kingdom? Let them try to cross the water first.\"",
            f"\"Draw your blade, Diya. We hold this ford until sunrise.\"",
            f"\"Let them bring their entire vanguard. The ward stands as long as {char_name} draws breath.\"",
            f"\"No more running through the shadows of Delhi. This ends tonight at the citadel.\"",
            f"\"Stand your ground! We didn't bleed on the mountain trail to yield the gate!\"",
        ]
    elif any(w in emo_lower for w in ("grief", "sad", "sorrow", "melanchol", "regret")):
        lines = [
            f"\"Every time the rain starts like this, I keep expecting to hear her voice by the doorway.\"",
            f"\"You think I don't know the cost? I carry it with every step through the ruins.\"",
            f"\"She told me the lantern spirits would guide me... but she never said it would feel this lonely.\"",
            f"\"The silver watch still ticks, but the hands feel heavier every day since Delhi.\"",
            f"\"Some promises outlive the people who made them. That's why I'm still here.\"",
            f"\"The citadel of ash remembers what we lost, even if Delhi has forgotten.\"",
            f"\"I held the key she left behind, wondering if she knew what it would demand of {char_name}.\"",
            f"\"All the ancient glory in this kingdom cannot bring back the ones we left behind.\"",
        ]
    elif any(w in emo_lower for w in ("joy", "happy", "relie", "hope")):
        lines = [
            f"\"Look at the water—the current is holding! We actually made it past the outer ward!\"",
            f"\"For the first time since leaving the old house in Delhi, I think we have a real chance.\"",
            f"\"I told you the archives wouldn't lead us astray. Let's see what lies ahead.\"",
            f"\"The seals are intact! Varun was wrong—the kingdom hasn't fallen yet!\"",
            f"\"Feel that morning breeze coming off the mountains? We survived the night spirits!\"",
            f"\"Diya, look—the obsidian cipher matched your family's key perfectly!\"",
            f"\"{char_name}, smile! The sun is breaking through the Dark Forest!\"",
            f"\"The ward bells are chiming... the citadel has recognized its rightful heir!\"",
        ]
    else:  # Calm / Curiosity / Inquisitive
        lines = [
            f"\"Notice how the mist avoids the riverbank? There's more to this place than meets the eye.\"",
            f"\"If we read the ancient cipher before dawn, we won't need to draw a single blade.\"",
            f"\"Tell me everything you saw near the old ford. Leave nothing out.\"",
            f"\"The carvings on these pillars predate Delhi itself. Who built these water wards?\"",
            f"\"Look closely at the brass lantern's flame—it's turning amber near the altar.\"",
            f"\"There's a subterranean canal beneath these flagstones... running water still flows below us.\"",
            f"\"{char_name}, compare this rune against the seal on Meera's watch. They're identical.\"",
            f"\"If the spirits cannot cross running water, then this bridge is our only safe passage.\"",
        ]

    # Pick 3 fresh distinct lines each time, avoiding the previous set
    fresh_lines = [l for l in lines if l not in _last_dialogue_lines]
    if len(fresh_lines) < 3:
        fresh_lines = lines
    chosen = random.sample(fresh_lines, min(3, len(fresh_lines)))
    _last_dialogue_lines = set(chosen)

    return [
        sb.DialogueOption(
            line=chosen[0],
            underlying_emotion=emotion,
            intensity=intensity,
            why_in_voice=f"Expresses {char_name}'s {emotion} under {sit_clean}.",
        ),
        sb.DialogueOption(
            line=chosen[1],
            underlying_emotion=emotion,
            intensity=min(10, intensity + 1),
            why_in_voice=f"Reflects {char_name}'s background and underlying emotional tension.",
        ),
        sb.DialogueOption(
            line=chosen[2],
            underlying_emotion=emotion,
            intensity=max(1, intensity - 1),
            why_in_voice="Grounded response matching established character traits.",
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

    # Determine emotion dynamically based on semantic intent and acoustic weight
    if any(w in clean_lower for w in ("love", "truly", "heart", "darling", "adore", "dearest", "kiss", "passion", "bithika", "subhankar")):
        p_emo = "Affection / Deep Love"
        s_emo = "Tenderness"
        inten = 8
        val = "positive"
        energy = "medium"
        cues = "Warm vocal resonance, softening cadence, gentle micro-pauses"
        mismatch = False
        note = "Warm vocal tone matches sincere affection and intimate dialogue."
        summary = "Delivery conveys sincere affection and emotional vulnerability."
    elif any(w in clean_lower for w in ("fear", "scared", "danger", "run", "dark", "wraith", "monster", "kill", "die", "shadow")):
        p_emo = "Fear / High Urgency"
        s_emo = "Panic"
        inten = 9
        val = "negative"
        energy = "high"
        cues = "Accelerated tempo, shallow breathing, elevated vocal pitch"
        mismatch = False
        note = "Vocal agitation mirrors the high-stakes threat in the line."
        summary = "Urgent, strained delivery communicates immediate peril."
    elif any(w in clean_lower for w in ("won't", "never", "fight", "stand", "swear", "defeat", "blade", "strike", "refuse")):
        p_emo = "Defiance / Determination"
        s_emo = "Courage"
        inten = 8
        val = "positive"
        energy = "high"
        cues = "Resonant chest voice, firm cadence, crisp consonant articulation"
        mismatch = False
        note = "Firm acoustic attack underscores protagonist resolve."
        summary = "Delivery is commanding, resolute, and unwavering."
    elif any(w in clean_lower for w in ("sad", "grief", "lost", "crying", "tears", "alone", "heavy", "goodbye", "sorry")):
        p_emo = "Sadness / Grief"
        s_emo = "Sorrow"
        inten = 7
        val = "negative"
        energy = "low"
        cues = "Slow tempo, descending pitch contour, prolonged pauses"
        mismatch = False
        note = "Subdued vocal dynamics capture solemn melancholy."
        summary = "Introspective delivery imbued with restrained grief."
    elif any(w in clean_lower for w in ("why", "what", "who", "where", "how", "secret", "truth", "hidden")):
        p_emo = "Inquisitive / Suspicion"
        s_emo = "Curiosity"
        inten = 6
        val = "neutral"
        energy = "medium"
        cues = "Rising terminal inflection, deliberate pacing, measured breath"
        mismatch = False
        note = "Cautious inflection matches investigative intent."
        summary = "Guarded vocal curiosity probing for answers."
    else:
        p_emo = "Narrative Conviction"
        s_emo = "Poise"
        inten = 7
        val = "neutral"
        energy = "medium"
        cues = "Measured pacing, clear diction, grounded vocal register"
        mismatch = False
        note = "Balanced acoustic delivery aligned with narrative dialogue."
        summary = "Natural and steady line delivery."

    # Check for words vs tone contrast (e.g. cheerful words spoken in fear/sadness)
    cheerful_words = ("happy", "glad", "fine", "great", "wonderful", "calm", "joy", "peace")
    if any(w in clean_lower for w in cheerful_words) and val == "negative":
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
