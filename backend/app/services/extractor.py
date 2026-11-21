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
    name_low = entity_name.lower().strip()
    attr_low = attribute.lower().strip()

    # Explicit place attribute
    if attr_low == "place":
        return "place"

    # Known place patterns in entity name
    place_keywords = ("delhi", "mumbai", "kolkata", "kanchrapara", "forest", "kingdom", "citadel", "castle", "fortress", "city", "river", "bridge", "beach")
    if any(k in name_low for k in place_keywords):
        return "place"

    # Known organization patterns
    org_keywords = ("guild", "order", "archives", "council", "clan", "guard", "scouts", "army")
    if any(k in name_low for k in org_keywords):
        return "organization"

    # Known rule patterns
    if attr_low in ("world_rule", "rule") or "rule" in name_low:
        return "rule"

    # Known object patterns
    object_keywords = ("watch", "key", "sword", "blade", "staff", "lantern", "scroll", "book", "letter", "sigil")
    if any(k in name_low for k in object_keywords):
        return "object"

    # Standard character traits and relationships
    if attr_low in ("appearance", "age", "knowledge", "relationship", "emotion", "ability", "possession", "location", "event"):
        return "character"

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

            entity = None
            if clean_name and name_lower not in ("narrator", "world", "story", "unknown"):
                entity = existing_entities.get(name_lower)
                etype = infer_entity_type(rf.attribute, rf.value, clean_name)
                if not entity:
                    entity = Entity(story_id=story_id, name=clean_name, type=etype)
                    self.db.add(entity)
                    self.db.flush()
                    existing_entities[name_lower] = entity
                    entities_created.append(entity)
                elif entity.type != etype and etype == "place":
                    entity.type = "place"
                    self.db.flush()

            # Also register referenced locations as place entities
            if rf.attribute.lower() in ("location", "place") and rf.value:
                val_clean = rf.value.strip()
                val_lower = val_clean.lower()
                if val_clean and val_lower not in ("narrator", "world", "story"):
                    if val_lower in existing_entities:
                        if existing_entities[val_lower].type != "place":
                            existing_entities[val_lower].type = "place"
                            self.db.flush()
                    else:
                        place_entity = Entity(story_id=story_id, name=val_clean, type="place")
                        self.db.add(place_entity)
                        self.db.flush()
                        existing_entities[val_lower] = place_entity
                        entities_created.append(place_entity)

            # Also register relationship target characters as character entities
            if rf.attribute.lower() == "relationship" and rf.value:
                words = rf.value.split()
                if words:
                    target_name = words[-1].strip().capitalize()
                    target_low = target_name.lower()
                    if target_name.isalpha() and target_low not in existing_entities and target_low not in ("him", "her", "them", "anyone", "someone", "no"):
                        char_entity = Entity(story_id=story_id, name=target_name, type="character")
                        self.db.add(char_entity)
                        self.db.flush()
                        existing_entities[target_low] = char_entity
                        entities_created.append(char_entity)

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
