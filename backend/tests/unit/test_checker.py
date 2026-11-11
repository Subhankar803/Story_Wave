"""Unit tests for ConsistencyChecker."""
from sqlalchemy.orm import Session
from app.models.fact import Fact
from app.models.story import Story
from app.services.checker import ConsistencyChecker, normalize_flag_type


def test_normalize_flag_type():
    assert normalize_flag_type("location_time") == "location/time conflict"
    assert normalize_flag_type("appearance") == "changed physical trait"
    assert normalize_flag_type("world_rule") == "broken world rule"
    assert normalize_flag_type("knowledge") == "knowledge a character should not have"


def test_checker_detects_conflict(db: Session, test_story: Story):
    fact = Fact(
        story_id=test_story.id,
        entity_name="Aarav",
        attribute="appearance",
        value="brown eyes",
        chapter_number=1,
        quote="He had brown eyes and wore the silver watch",
    )
    db.add(fact)
    db.commit()

    checker = ConsistencyChecker(db)
    contradictory_text = "Aarav squinted with his bright green eyes at the spirit."
    flags = checker.check_new_text(
        story_id=test_story.id,
        chapter_text=contradictory_text,
        chapter_number=2,
        existing_facts=[fact],
    )

    assert len(flags) == 1
    assert flags[0].type == "changed physical trait"
    assert flags[0].old_quote
    assert flags[0].new_quote
    assert flags[0].chapter_number == 2

