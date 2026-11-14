"""Orchestrates ingest -> extract -> store -> check -> flag (BackgroundTasks)."""
import asyncio
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.core.logging import logger
from app.models.chapter import Chapter
from app.models.entity import Entity
from app.models.fact import Fact
from app.models.flag import Flag
from app.models.rule import Rule
from app.services.checker import ConsistencyChecker
from app.services.extractor import ChapterExtractor
from app.services.live_manager import live_manager


class AnalysisRunner:
    """Coordinates the complete ingestion, extraction, consistency checking, and flagging pipeline."""

    def __init__(self, db: Session):
        self.db = db
        self.extractor = ChapterExtractor(db)
        self.checker = ConsistencyChecker(db)

    def clear_stale_chapter_data(self, story_id: int, chapter_id: int, chapter_number: int) -> None:
        """FR-3: Re-analysis after an edit must update or remove stale facts, rules, and flags."""
        self.db.execute(delete(Fact).where(Fact.story_id == story_id, Fact.chapter_id == chapter_id))
        self.db.execute(delete(Rule).where(Rule.story_id == story_id, Rule.chapter_id == chapter_id))
        self.db.execute(delete(Flag).where(Flag.story_id == story_id, Flag.chapter_number == chapter_number))
        self.db.flush()

    def run_chapter_analysis(
        self,
        story_id: int,
        chapter_id: int,
        is_reanalysis: bool = False,
    ) -> tuple[int, list[Flag]]:
        """Synchronously execute the full pipeline for a chapter."""
        chapter = self.db.get(Chapter, chapter_id)
        if not chapter:
            raise ValueError(f"Chapter {chapter_id} not found")

        try:
            if is_reanalysis:
                self.clear_stale_chapter_data(story_id, chapter_id, chapter.number)

            chapter.status = "pending"
            chapter.error_message = None
            self.db.flush()

            # Retrieve prior facts from previous chapters and all established rules for consistency checking
            prior_facts_stmt = (
                select(Fact)
                .where(
                    Fact.story_id == story_id,
                    (Fact.chapter_number < chapter.number) | (Fact.attribute == "rule") | (Fact.chapter_id == None),
                )
            )
            prior_facts = list(self.db.scalars(prior_facts_stmt).all())

            # Ensure every rule from the Rule table is included as a fact for consistency checking
            all_rules = self.db.scalars(select(Rule).where(Rule.story_id == story_id)).all()
            existing_rule_descs = set()
            for f in prior_facts:
                if f.value:
                    existing_rule_descs.add(f.value.strip().lower())
                if f.quote:
                    existing_rule_descs.add(f.quote.strip().lower())
            for r in all_rules:
                r_desc = (r.description or "").strip()
                ent = "World"
                val = r_desc
                if ":" in r_desc:
                    parts = r_desc.split(":", 1)
                    ent = parts[0].strip()
                    val = parts[1].strip()
                if val.lower() not in existing_rule_descs and r_desc.lower() not in existing_rule_descs:
                    existing_rule_descs.add(val.lower())
                    existing_rule_descs.add(r_desc.lower())
                    prior_facts.append(
                        Fact(
                            story_id=story_id,
                            entity_name=ent,
                            attribute="rule",
                            value=val,
                            quote=r.quote or f"Rule established by author: {r_desc}",
                            chapter_number=r.chapter_number or 1,
                        )
                    )

            # 1. Consistency check against existing story bible
            detected_flags = self.checker.check_new_text(
                story_id=story_id,
                chapter_text=chapter.text,
                chapter_number=chapter.number,
                existing_facts=prior_facts,
            )

            # 2. Extract facts and rules from new chapter text (retries once on failure)
            raw_facts = self.extractor.extract_from_text(chapter.text, chapter.number, retries=1)

            # 3. Persist facts, entities, and rules to DB
            _, created_facts, _ = self.extractor.save_facts_and_entities(
                story_id=story_id,
                chapter_id=chapter.id,
                chapter_number=chapter.number,
                raw_facts=raw_facts,
            )

            chapter.status = "processed"
            self.db.commit()

            # Broadcast updates via LiveConnectionManager if an event loop is running
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    for flag in detected_flags:
                        loop.create_task(
                            live_manager.notify_flag_detected(
                                story_id,
                                {
                                    "id": flag.id,
                                    "type": flag.type,
                                    "explanation": flag.explanation,
                                    "old_quote": flag.old_quote,
                                    "new_quote": flag.new_quote,
                                    "chapter_number": flag.chapter_number,
                                },
                            )
                        )
                    loop.create_task(
                        live_manager.notify_chapter_status(
                            story_id, chapter.id, chapter.number, "processed"
                        )
                    )
            except Exception as e:
                logger.debug(f"Live broadcast skipped or failed: {e}")

            return len(created_facts), detected_flags

        except Exception as e:
            self.db.rollback()
            chapter = self.db.get(Chapter, chapter_id)
            if chapter:
                chapter.status = "failed"
                chapter.error_message = str(e)
                self.db.commit()

            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(
                        live_manager.notify_chapter_status(
                            story_id, chapter_id, chapter.number if chapter else 0, "failed", str(e)
                        )
                    )
            except Exception:
                pass

            logger.error(f"Pipeline error processing chapter {chapter_id}: {e}")
            raise


def execute_background_analysis(story_id: int, chapter_id: int, is_reanalysis: bool = False) -> None:
    """Entry point for FastAPI BackgroundTasks."""
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        runner = AnalysisRunner(db)
        runner.run_chapter_analysis(story_id, chapter_id, is_reanalysis=is_reanalysis)
    finally:
        db.close()
