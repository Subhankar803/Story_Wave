"""GET /stories/{id}/bible."""
from typing import Annotated, Sequence
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from app.api.deps import get_user_story
from app.db.session import get_db
from app.models.entity import Entity
from app.models.fact import Fact
from app.models.rule import Rule
from app.models.story import Story
from app.schemas.bible import BibleOut, EntityOut, FactOut, RuleCreate, RuleOut

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

    characters = [EntityOut.model_validate(e) for e in entities if e.type == "character" and e.name.lower() not in ("narrator", "world", "story", "unknown", "truly")]
    places = [EntityOut.model_validate(e) for e in entities if e.type == "place" and e.name.lower() not in ("narrator", "world", "story", "unknown", "truly")]
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


@router.post("/rules", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
def create_story_rule(
    payload: RuleCreate,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> RuleOut:
    """Create a new story or character rule (e.g. Gopu is lactose intolerant)."""
    entity = (payload.entity_name or payload.character_name or "").strip()
    desc = payload.description.strip()
    if entity and not desc.lower().startswith(entity.lower()):
        full_desc = f"{entity}: {desc}"
    else:
        full_desc = desc

    quote = payload.quote or f"Rule established by author: {full_desc}"

    # 1. Create Rule entry
    rule = Rule(
        story_id=story.id,
        chapter_number=payload.chapter_number or 1,
        description=full_desc,
        quote=quote,
    )
    db.add(rule)

    # 2. Create corresponding Fact row so ConsistencyChecker evaluates it
    fact = Fact(
        story_id=story.id,
        entity_name=entity or "World",
        attribute="rule",
        value=desc,
        quote=quote,
        chapter_number=payload.chapter_number or 1,
    )
    db.add(fact)

    # 3. Create Entity record if character does not exist yet
    if entity and entity.lower() != "world":
        existing_char = db.scalar(
            select(Entity).where(Entity.story_id == story.id, func.lower(Entity.name) == entity.lower())
        )
        if not existing_char:
            db.add(Entity(story_id=story.id, name=entity, type="character"))

    db.commit()
    db.refresh(rule)
    return RuleOut.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_story_rule(
    rule_id: int,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete a custom rule and its corresponding fact."""
    rule = db.scalar(select(Rule).where(Rule.story_id == story.id, Rule.id == rule_id))
    if rule:
        db.execute(
            delete(Fact).where(
                Fact.story_id == story.id,
                Fact.attribute == "rule",
                (Fact.value == rule.description) | (Fact.quote == rule.quote),
            )
        )
        db.delete(rule)
        db.commit()


rules_router = APIRouter(prefix="/stories/{id}/rules", tags=["Story Rules"])
rules_router.add_api_route("", create_story_rule, methods=["POST"], response_model=RuleOut, status_code=status.HTTP_201_CREATED)
rules_router.add_api_route("/{rule_id}", delete_story_rule, methods=["DELETE"], status_code=status.HTTP_204_NO_CONTENT)

