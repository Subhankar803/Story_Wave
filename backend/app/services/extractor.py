"""Pipeline stage: chapter text -> facts with quotes."""
import json
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.logging import logger
from app.models.chapter import Chapter
from app.models.entity import Entity
from app.models.fact import Fact
from app.models.rule import Rule
from app.services import model_adapter
from app.services.retriever import simple_text_embedding


def infer_entity_type(attribute: str, value: str, entity_name: str) -> str:
    """Infer entity type based on attribute and name heuristics."""
    attr = attribute.lower()
    if attr in ("location", "place"):
        return "place"
    if attr in ("possession", "object", "item"):
        return "object"
    if attr in ("organization", "group", "faction"):
        return "organization"
    if attr in ("world_rule", "rule"):
        return "rule"
    return "character"


class ChapterExtractor:
    """Service to extract structured facts and entities from chapter text with retry mechanism."""

    def __init__(self, db: Session):
        self.db = db

    def extract_from_text(self, text: str, chapter_number: int, retries: int = 1) -> list[model_adapter.Fact]:
        """Extract facts using LLM adapter with single retry on JSON/parsing failure (FR-1)."""
        last_error = None
        for attempt in range(retries + 1):
            try:
                facts = model_adapter.extract(text, chapter_number)
                if facts:
                    return facts
            except Exception as e:
                last_error = e
                logger.warning(f"Fact extraction attempt {attempt + 1} failed: {e}")

        if last_error:
            raise RuntimeError(f"Extraction failed after {retries + 1} attempts: {last_error}")
        return []

    def save_facts_and_entities(
        self,
        story_id: int,
        chapter_id: int,
        chapter_number: int,
        raw_facts: list[model_adapter.Fact],
    ) -> tuple[list[Entity], list[Fact], list[Rule]]:
        """Persist extracted entities, facts, and world rules to database."""
        entities_created: list[Entity] = []
        facts_created: list[Fact] = []
        rules_created: list[Rule] = []

        # Cache existing entities for this story to prevent duplicate names
        existing_entities = {
            e.name.lower(): e
            for e in self.db.scalars(select(Entity).where(Entity.story_id == story_id)).all()
        }

        for rf in raw_facts:
            clean_name = rf.entity.strip()
            name_lower = clean_name.lower()

            entity = existing_entities.get(name_lower)
            if not entity and clean_name:
                etype = infer_entity_type(rf.attribute, rf.value, clean_name)
                entity = Entity(story_id=story_id, name=clean_name, type=etype)
                self.db.add(entity)
                self.db.flush()
                existing_entities[name_lower] = entity
                entities_created.append(entity)

            # Generate embedding vector
            embedding_vec = simple_text_embedding(f"{rf.entity} {rf.attribute} {rf.value} {rf.quote}")

            fact_model = Fact(
                story_id=story_id,
                entity_id=entity.id if entity else None,
                chapter_id=chapter_id,
                chapter_number=chapter_number,
                entity_name=clean_name,
                attribute=rf.attribute,
                value=rf.value,
                day=rf.day,
                quote=rf.quote,
                embedding=json.dumps(embedding_vec),
            )
            self.db.add(fact_model)
            facts_created.append(fact_model)

            # Check if this fact is a world rule
            if rf.attribute.lower() in ("world_rule", "rule") or "rule" in rf.attribute.lower():
                rule_model = Rule(
                    story_id=story_id,
                    chapter_id=chapter_id,
                    chapter_number=chapter_number,
                    description=rf.value,
                    quote=rf.quote,
                )
                self.db.add(rule_model)
                rules_created.append(rule_model)

        self.db.flush()
        return entities_created, facts_created, rules_created
