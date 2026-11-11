"""Pipeline stage: optional NLI filter + LLM confirmation -> flags."""
from typing import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.logging import logger
from app.models.fact import Fact
from app.models.flag import Flag
from app.services import model_adapter


FLAG_TYPE_MAPPING = {
    "location_time": "location/time conflict",
    "location/time conflict": "location/time conflict",
    "appearance": "changed physical trait",
    "changed physical trait": "changed physical trait",
    "world_rule": "broken world rule",
    "broken world rule": "broken world rule",
    "knowledge": "knowledge a character should not have",
    "knowledge a character should not have": "knowledge a character should not have",
}


def normalize_flag_type(raw_type: str) -> str:
    """Normalize conflict type to PRD specification types."""
    low = raw_type.lower().strip()
    for k, v in FLAG_TYPE_MAPPING.items():
        if k in low:
            return v
    return raw_type


class ConsistencyChecker:
    """Service to check new chapter text against existing story facts for contradictions (FR-2)."""

    def __init__(self, db: Session):
        self.db = db

    def check_new_text(
        self,
        story_id: int,
        chapter_text: str,
        chapter_number: int,
        existing_facts: Sequence[Fact],
    ) -> list[Flag]:
        """Audit text against existing facts and create flags for detected contradictions."""
        if not existing_facts:
            return []

        # Convert DB facts to model format
        model_bible = model_adapter.db_facts_to_model_bible(list(existing_facts))

        # Check conflicts using model adapter
        conflicts = model_adapter.check(model_bible, chapter_text, chapter_number)

        flags: list[Flag] = []
        for c in conflicts:
            norm_type = normalize_flag_type(c.type)

            # Match conflicting fact in DB if possible
            matched_fact = next(
                (f for f in existing_facts if c.old_quote and (c.old_quote in f.quote or f.quote in c.old_quote)),
                None,
            )

            flag = Flag(
                story_id=story_id,
                fact_id=matched_fact.id if matched_fact else None,
                type=norm_type,
                explanation=c.explanation,
                old_quote=c.old_quote,
                new_quote=c.new_quote,
                chapter_number=chapter_number,
                severity="error" if norm_type in ("broken world rule", "location/time conflict") else "warning",
                status="open",
            )
            self.db.add(flag)
            flags.append(flag)

        self.db.flush()
        return flags
