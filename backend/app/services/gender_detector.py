"""Intelligent character gender detection and voice persona assignment using NumPy vector scoring.

Provides calibrated masculine and feminine acoustic persona assignment for:
- Character Dialogue Generator
- Voice Studio (Recording & Emotional TTS)
"""
from __future__ import annotations

import re
from typing import Tuple
import numpy as np

# Female lexical tokens with calibrated importance weights
FEMALE_TOKENS: dict[str, float] = {
    # Names (Indian, Western, Global)
    "sohini": 6.5,
    "meera": 6.5,
    "diya": 6.5,
    "bithika": 6.5,
    "priya": 6.5,
    "ananya": 6.5,
    "rhea": 6.0,
    "puja": 6.0,
    "pooja": 6.0,
    "sneha": 6.0,
    "riya": 6.0,
    "shreya": 6.0,
    "maya": 6.0,
    "tara": 6.0,
    "aarti": 6.0,
    "sarah": 6.0,
    "emma": 6.0,
    "mary": 6.0,
    "elizabeth": 6.0,
    "alice": 6.0,
    "lucy": 6.0,
    "anna": 6.0,
    "clara": 6.0,
    "nandini": 6.5,
    "rohini": 6.5,
    "kavita": 6.5,
    "sunita": 6.5,
    # Titles & Family relations
    "woman": 5.0,
    "girl": 5.0,
    "female": 5.0,
    "lady": 4.5,
    "queen": 5.0,
    "mother": 5.0,
    "mom": 5.0,
    "sister": 5.0,
    "daughter": 5.0,
    "wife": 5.0,
    "princess": 5.0,
    "actress": 4.5,
    "madam": 4.0,
    "mrs": 4.5,
    "ms": 4.5,
    "miss": 4.5,
    # Pronouns
    "she": 4.0,
    "her": 4.0,
    "hers": 4.0,
    "herself": 4.0,
}

# Male lexical tokens with calibrated importance weights
MALE_TOKENS: dict[str, float] = {
    # Names (Indian, Western, Global)
    "ram": 6.5,
    "kabir": 6.5,
    "aarav": 6.5,
    "varun": 6.5,
    "surya": 6.5,
    "mohit": 6.5,
    "rohit": 6.5,
    "arjun": 6.5,
    "karan": 6.5,
    "subhankar": 6.5,
    "john": 6.0,
    "david": 6.0,
    "alex": 4.5,
    "robert": 6.0,
    "michael": 6.0,
    "james": 6.0,
    "kael": 6.0,
    "gopu": 6.0,
    "vikram": 6.5,
    "rahul": 6.5,
    "amit": 6.5,
    "anil": 6.5,
    "sanjay": 6.5,
    "vijay": 6.5,
    "raj": 6.5,
    # Titles & Family relations
    "man": 5.0,
    "boy": 5.0,
    "male": 5.0,
    "gentleman": 4.5,
    "king": 5.0,
    "father": 5.0,
    "dad": 5.0,
    "brother": 5.0,
    "son": 5.0,
    "husband": 5.0,
    "prince": 5.0,
    "actor": 4.5,
    "lord": 5.0,
    "sir": 4.0,
    "mr": 4.5,
    "detective": 3.5,
    "inspector": 3.5,
    "guy": 4.0,
    # Pronouns
    "he": 4.0,
    "him": 4.0,
    "his": 4.0,
    "himself": 4.0,
}

FEMALE_SUFFIXES = ("ini", "shree", "ika", "ita", "iya", "wati", "devi", "ee")
MALE_SUFFIXES = ("am", "av", "un", "it", "ar", "esh", "raj", "deep", "jeet", "nath", "an")


def detect_character_gender(
    character: str = "",
    situation: str = "",
    context: str = "",
    text: str = "",
) -> tuple[str, str, float]:
    """Infers character gender and recommended natural neural voice using NumPy vector scoring.

    Returns:
        (gender, voice_identifier, confidence)
        gender: 'male' | 'female'
        voice_identifier: 'en-US-ChristopherNeural' (male) | 'en-US-JennyNeural' (female)
        confidence: float in [0.50, 1.00]
    """
    clean_char = (character or "").strip().lower()
    full_corpus = f"{character} {situation} {context} {text}".lower()
    words = re.findall(r"\b[a-z]+\b", full_corpus)
    char_words = re.findall(r"\b[a-z]+\b", clean_char)

    m_features: list[float] = []
    f_features: list[float] = []

    # 1. Primary character name match (heavyweight 3.0x multiplier)
    for w in char_words:
        if w in MALE_TOKENS:
            m_features.append(MALE_TOKENS[w] * 3.0)
        if w in FEMALE_TOKENS:
            f_features.append(FEMALE_TOKENS[w] * 3.0)

    # 2. Context words match (1.0x weight)
    for w in words:
        if w in MALE_TOKENS and w not in char_words:
            m_features.append(MALE_TOKENS[w])
        if w in FEMALE_TOKENS and w not in char_words:
            f_features.append(FEMALE_TOKENS[w])

    # 3. Morphological suffix analysis on primary character name
    primary_name = char_words[0] if char_words else clean_char
    if primary_name:
        if any(primary_name.endswith(sfx) for sfx in FEMALE_SUFFIXES):
            f_features.append(4.5)
        elif primary_name.endswith(("a", "i")) and len(primary_name) > 3 and not any(primary_name.endswith(ms) for ms in MALE_SUFFIXES):
            f_features.append(3.0)

        if any(primary_name.endswith(sfx) for sfx in MALE_SUFFIXES):
            m_features.append(4.5)

    # 4. NumPy vector aggregation & softmax computation
    m_score = float(np.sum(m_features)) if m_features else 0.0
    f_score = float(np.sum(f_features)) if f_features else 0.0

    logits = np.array([m_score, f_score], dtype=np.float64)
    if np.all(logits == 0.0):
        # Default fallback to masculine narrator if completely unidentifiable
        logits = np.array([1.0, 0.0])

    exp_logits = np.exp(logits - np.max(logits))
    probs = exp_logits / np.sum(exp_logits)
    male_prob, female_prob = float(probs[0]), float(probs[1])

    if female_prob > male_prob:
        return "female", "en-US-JennyNeural", female_prob
    else:
        return "male", "en-US-ChristopherNeural", male_prob


def get_voice_for_character(
    character: str = "",
    situation: str = "",
    context: str = "",
    text: str = "",
) -> tuple[str, str, float]:
    """Helper returning (voice_id, gender, confidence)."""
    gender, voice, conf = detect_character_gender(character, situation, context, text)
    return voice, gender, conf
