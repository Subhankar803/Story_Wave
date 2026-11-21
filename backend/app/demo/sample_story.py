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


DEMO_STORIES = {
    "Chronicles of the Lantern Spirits": [
        "Aarav, seventeen, lived in Delhi with his grandmother. He had brown eyes and wore the silver watch his late mother Meera had left him. The old lantern spirits of the city could never cross running water, his grandmother warned him.",
        "On Monday morning Aarav boarded the train in Delhi, clutching his mother's old watch. He had no idea that Meera had hidden a brass key somewhere in the old house; only his grandmother knew.",
        "By Monday evening Aarav was standing on the beach in Mumbai, watching the sun go down and asking strangers about the lantern spirits.",
        "Aarav squinted with his bright green eyes at the spirit drifting across the river toward him. 'The key Mom hid under the staircase,' he said, 'is what you want, isn't it?'",
        "Beside the river rapids, Diya held high the lantern as the ward flared with golden light, proving that the ancient kingdom of Delhi would endure.",
    ],
    "Echoes of the Obsidian Star": [
        "Commander Kael, thirty, surveyed the neon-lit spires of Neo-Delhi with his obsidian eyes. His starship engines were engineered with an absolute safeguard: quantum drives could never ignite inside planetary ion-fields.",
        "On cycle 14 Kael launched his shuttle from the orbital platform, carrying the encrypted datacore. He had no knowledge of the hidden override code stored in the mothership mainframe.",
        "By cycle 15 evening Kael was docking at the distant outer colony of Proxima, scanning local frequencies for rebel chatter.",
        "Kael stared with glowing sapphire cyber-optics as an automated gunship hovered inside the ion-field, activating its quantum drive. 'The override code hidden in the sub-level core is yours,' he broadcasted over open comms.",
        "The obsidian starship pulsed with energy as Lyra decrypted the final transmission, opening the jumpgate across the stars.",
    ],
    "Shadows of the Midnight Fog": [
        "Detective Kabir, thirty-five, patrolled the damp riverbanks of Kolkata with dark brown eyes. The old maritime precinct followed an unbendable rule: suspect ferries could never dock during high tide.",
        "On Monday dawn Kabir received a tip at the central station, holding a locked briefcase. He had no clue where the ledger key was concealed in the warehouse safe.",
        "By Monday nightfall Kabir was seated at a café in Mumbai, interrogating a mysterious informant.",
        "Kabir looked up with striking amber eyes as a smugglers' ferry drifted across the high-tide rapids to dock. 'The key under the warehouse floorboards,' he whispered, 'is already in play.'",
        "At the midnight bell, the harbor mist cleared, revealing the missing manifest that brought the city's corrupt syndicate to light.",
    ],
}


def load_demo_story(db: Session, story_id: int, chapter_count: int = 4, title: str | None = None) -> dict:
    """Load demo chapters into story_id and execute the analysis pipeline."""
    story = db.get(Story, story_id)
    if not story:
        raise ValueError(f"Story {story_id} not found")

    story_title = title or "Chronicles of the Lantern Spirits"
    story.title = story_title

    # Clear previous story data
    db.execute(delete(Flag).where(Flag.story_id == story_id))
    db.execute(delete(Rule).where(Rule.story_id == story_id))
    db.execute(delete(Fact).where(Fact.story_id == story_id))
    db.execute(delete(Entity).where(Entity.story_id == story_id))
    db.execute(delete(Chapter).where(Chapter.story_id == story_id))
    db.flush()

    raw_chapters = DEMO_STORIES.get(story_title, DEMO_STORIES["Chronicles of the Lantern Spirits"])
    target_count = max(1, min(chapter_count, len(raw_chapters)))
    selected_chapters = raw_chapters[:target_count]

    runner = AnalysisRunner(db)
    chapters_loaded = []
    total_facts = 0
    all_flags: list[Flag] = []

    for i, ch_text in enumerate(selected_chapters, 1):
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
        "title": story_title,
        "message": f"Demo story '{story_title}' loaded with {len(chapters_loaded)} chapters successfully.",
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
