"""Unit tests for ChapterExtractor."""
from sqlalchemy.orm import Session
from app.models.chapter import Chapter
from app.models.story import Story
from app.services.extractor import ChapterExtractor, infer_entity_type


def test_infer_entity_type():
    assert infer_entity_type("location", "Delhi", "Delhi") == "place"
    assert infer_entity_type("possession", "silver watch", "Watch") == "object"
    assert infer_entity_type("organization", "Guild", "Guild") == "organization"
    assert infer_entity_type("appearance", "brown eyes", "Aarav") == "character"


def test_extractor_extract_and_save(db: Session, test_story: Story):
    extractor = ChapterExtractor(db)
    chapter = Chapter(story_id=test_story.id, number=1, text="Aarav lived in Delhi with his grandmother. He had brown eyes.", status="pending")
    db.add(chapter)
    db.flush()

    raw_facts = extractor.extract_from_text(chapter.text, chapter.number, retries=1)
    assert len(raw_facts) > 0

    entities, facts, rules = extractor.save_facts_and_entities(
        story_id=test_story.id,
        chapter_id=chapter.id,
        chapter_number=chapter.number,
        raw_facts=raw_facts,
    )
    assert len(facts) > 0
    assert all(f.story_id == test_story.id for f in facts)
    assert all(f.chapter_id == chapter.id for f in facts)
    assert all(f.quote for f in facts)  # Every fact must include a verbatim source quote

