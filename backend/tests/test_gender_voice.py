"""Unit and integration tests for character gender detection and voice selection."""
import pytest
from app.services.gender_detector import detect_character_gender, get_voice_for_character


def test_male_character_detection():
    male_cases = ["Ram", "Kabir", "Aarav", "Varun", "Surya", "Mohit", "Subhankar", "David"]
    for name in male_cases:
        gender, voice, conf = detect_character_gender(character=name)
        assert gender == "male", f"Expected male for {name}, got {gender}"
        assert voice == "en-US-ChristopherNeural", f"Expected Christopher for {name}, got {voice}"
        assert conf >= 0.70


def test_female_character_detection():
    female_cases = ["Sohini", "Meera", "Diya", "Bithika", "Priya", "Ananya", "Nandini", "Sarah"]
    for name in female_cases:
        gender, voice, conf = detect_character_gender(character=name)
        assert gender == "female", f"Expected female for {name}, got {gender}"
        assert voice == "en-US-JennyNeural", f"Expected Jenny for {name}, got {voice}"
        assert conf >= 0.70


def test_gender_inference_from_context():
    # Sohini in situation/text with no explicit character name
    gender, voice, conf = detect_character_gender(character="", text="Sohini whispered softly to her companion.")
    assert gender == "female"
    assert voice == "en-US-JennyNeural"

    # Ram in situation/text with no explicit character name
    gender, voice, conf = detect_character_gender(character="", text="Ram drew his sword with quiet confidence.")
    assert gender == "male"
    assert voice == "en-US-ChristopherNeural"


def test_get_voice_for_character():
    voice, gender, conf = get_voice_for_character(character="Ram")
    assert voice == "en-US-ChristopherNeural"
    assert gender == "male"

    voice, gender, conf = get_voice_for_character(character="Sohini")
    assert voice == "en-US-JennyNeural"
    assert gender == "female"
