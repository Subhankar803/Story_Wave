"""Planted-contradiction demo story (built on the model's DEMO_CHAPTERS)."""
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.models.chapter import Chapter
from app.models.entity import Entity
from app.models.fact import Fact
from app.models.flag import Flag
from app.models.rule import Rule
from app.models.story import Story
from app.services import model_adapter
from app.services.analysis_runner import AnalysisRunner


def load_demo_story(db: Session, story_id: int) -> dict:
    """Load the 4 demo chapters into story_id and execute the analysis pipeline."""
    story = db.get(Story, story_id)
    if not story:
        raise ValueError(f"Story {story_id} not found")

    # Clear previous story data
    db.execute(delete(Flag).where(Flag.story_id == story_id))
    db.execute(delete(Rule).where(Rule.story_id == story_id))
    db.execute(delete(Fact).where(Fact.story_id == story_id))
    db.execute(delete(Entity).where(Entity.story_id == story_id))
    db.execute(delete(Chapter).where(Chapter.story_id == story_id))
    db.flush()

    runner = AnalysisRunner(db)
    chapters_loaded = []
    total_facts = 0
    all_flags: list[Flag] = []

    for i, ch_text in enumerate(model_adapter.DEMO_CHAPTERS, 1):
        ch = Chapter(
            story_id=story_id,
            number=i,
            text=ch_text,
            status="pending",
        )
        db.add(ch)
        db.flush()

        facts_count, flags = runner.run_chapter_analysis(
            story_id=story_id,
            chapter_id=ch.id,
            is_reanalysis=False,
        )
        total_facts += facts_count
        all_flags.extend(flags)
        chapters_loaded.append(ch.id)

    db.commit()

    return {
        "story_id": story_id,
        "message": "Planted-contradiction demo story loaded and analyzed successfully.",
        "chapters_count": len(chapters_loaded),
        "facts_count": total_facts,
        "flags_count": len(all_flags),
        "flags": [
            {
                "id": f.id,
                "type": f.type,
                "explanation": f.explanation,
                "old_quote": f.old_quote,
                "new_quote": f.new_quote,
                "chapter_number": f.chapter_number,
                "severity": f.severity,
            }
            for f in all_flags
        ],
    }
