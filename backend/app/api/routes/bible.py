"""GET /stories/{id}/bible."""
from typing import Annotated, Sequence
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import get_user_story
from app.db.session import get_db
from app.models.entity import Entity
from app.models.fact import Fact
from app.models.rule import Rule
from app.models.story import Story
from app.schemas.bible import BibleOut, EntityOut, FactOut, RuleOut

router = APIRouter(prefix="/stories/{id}/bible", tags=["Story Bible"])


@router.get("", response_model=BibleOut)
def get_story_bible(
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> BibleOut:
    """Retrieve structured story bible: characters, places, timeline, world rules, and facts (FR-3)."""
    entities: Sequence[Entity] = db.scalars(select(Entity).where(Entity.story_id == story.id)).all()
    facts: Sequence[Fact] = db.scalars(
        select(Fact).where(Fact.story_id == story.id).order_by(Fact.chapter_number.asc(), Fact.id.asc())
    ).all()
    rules: Sequence[Rule] = db.scalars(select(Rule).where(Rule.story_id == story.id)).all()

    characters = [EntityOut.model_validate(e) for e in entities if e.type == "character"]
    places = [EntityOut.model_validate(e) for e in entities if e.type == "place"]
    objects = [EntityOut.model_validate(e) for e in entities if e.type == "object"]
    organizations = [EntityOut.model_validate(e) for e in entities if e.type == "organization"]

    # Timeline includes facts with explicit day or timeline attributes
    timeline = [
        FactOut(
            id=f.id,
            entity_name=f.entity_name,
            attribute=f.attribute,
            value=f.value,
            chapter_number=f.chapter_number,
            day=f.day,
            quote=f.quote,
        )
        for f in facts
        if f.day is not None or f.attribute.lower() in ("event", "location", "timeline")
    ]

    fact_outs = [
        FactOut(
            id=f.id,
            entity_name=f.entity_name,
            attribute=f.attribute,
            value=f.value,
            chapter_number=f.chapter_number,
            day=f.day,
            quote=f.quote,
        )
        for f in facts
    ]

    rule_outs = [RuleOut.model_validate(r) for r in rules]

    return BibleOut(
        characters=characters,
        places=places,
        objects=objects,
        organizations=organizations,
        timeline=timeline,
        rules=rule_outs,
        facts=fact_outs,
        total_facts=len(facts),
    )
