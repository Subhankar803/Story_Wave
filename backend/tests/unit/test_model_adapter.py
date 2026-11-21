"""Unit tests for model_adapter."""
from app.models.fact import Fact as DBFact
from app.services import model_adapter


def test_model_adapter_exports():
    assert hasattr(model_adapter, "Fact")
    assert hasattr(model_adapter, "Conflict")
    assert hasattr(model_adapter, "extract")
    assert hasattr(model_adapter, "check")
    assert hasattr(model_adapter, "DEMO_CHAPTERS")
    assert len(model_adapter.DEMO_CHAPTERS) == 4


def test_db_fact_to_model():
    db_fact = DBFact(
        id=1,
        story_id=1,
        entity_name="Aarav",
        attribute="appearance",
        value="brown eyes",
        chapter_number=1,
        day="Monday",
        quote="He had brown eyes",
    )
    m_fact = model_adapter.db_fact_to_model(db_fact)
    assert m_fact.entity == "Aarav"
    assert m_fact.attribute == "appearance"
    assert m_fact.value == "brown eyes"
    assert m_fact.chapter == 1
    assert m_fact.day == "Monday"
    assert m_fact.quote == "He had brown eyes"


def test_extract_facts():
    text = "Aarav, seventeen, lived in Delhi with his grandmother. He had brown eyes."
    facts = model_adapter.extract(text, chapter=1)
    assert len(facts) >= 1
    entities = [f.entity for f in facts]
    assert "Aarav" in entities


def test_check_contradictions():
    bible = [
        model_adapter.Fact(
            entity="Aarav",
            attribute="appearance",
            value="brown eyes",
            chapter=1,
            quote="He had brown eyes",
        )
    ]
    conflicting_text = "Aarav squinted with his bright green eyes."
    conflicts = model_adapter.check(bible, conflicting_text, chapter=2)
    assert len(conflicts) >= 1
    assert any("eye" in c.explanation.lower() or "trait" in c.type.lower() for c in conflicts)


def test_generate_branches_and_dialogue():
    bible = [
        model_adapter.Fact(
            entity="Aarav",
            attribute="location",
            value="Delhi",
            chapter=1,
            quote="lived in Delhi",
        )
    ]
    branches = model_adapter.generate_branches(
        bible=bible,
        direction="Aarav finds a locked drawer",
        emotion="curiosity",
        intensity=6,
    )
    assert len(branches) == 3
    for b in branches:
        assert b.title
        assert b.scene

    dialogue = model_adapter.write_dialogue(
        bible=bible,
        character="Aarav",
        situation="Confronting an intruder",
        emotion="defiance",
        intensity=8,
    )
    assert len(dialogue) == 3


def test_analyze_voice_joy_and_intensity():
    text = "The show was really, really pretty much amazing. I am out of the spell."
    report = model_adapter.analyze_voice("dummy.webm", dialogue_text=text)
    assert report.primary_emotion == "Joy / Amazement"
    assert report.intensity >= 9
    assert report.valence == "positive"
    assert report.energy == "high"


def test_analyze_voice_show_does_not_trigger_how():
    text = "The show began at eight o'clock."
    report = model_adapter.analyze_voice("dummy.webm", dialogue_text=text)
    assert report.primary_emotion != "Inquisitive / Suspicion"
    assert report.primary_emotion == "Narrative Conviction"

