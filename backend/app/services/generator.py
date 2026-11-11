"""Pipeline stage: scenes, dialogue, branches grounded in retrieved facts; streaming."""
from typing import AsyncGenerator
from sqlalchemy.orm import Session
from app.models.fact import Fact
from app.schemas.generate import BranchOut, DialogueOptionOut
from app.services import model_adapter
from app.services.retriever import FactRetriever


class StoryGenerator:
    """Service to co-write scenes, dialogue, and multiverse branches grounded in the story bible (FR-4)."""

    def __init__(self, db: Session):
        self.db = db
        self.retriever = FactRetriever(db)

    def get_grounding_facts(self, story_id: int, query_text: str | None = None, character: str | None = None) -> list[model_adapter.Fact]:
        """Retrieve relevant facts rather than dumping the entire bible (FR-4 requirement)."""
        db_facts = self.retriever.retrieve_similar_facts(
            story_id=story_id,
            target_entity=character,
            query_text=query_text,
            top_k=15,
        )
        return model_adapter.db_facts_to_model_bible(db_facts)

    def generate_branches(
        self,
        story_id: int,
        direction: str,
        emotion: str = "calm",
        intensity: int = 5,
        sabotage: bool = False,
    ) -> list[BranchOut]:
        """Generate 2-3 branching scene options from grounded facts."""
        relevant_bible = self.get_grounding_facts(story_id, query_text=direction)
        raw_branches = model_adapter.generate_branches(
            bible=relevant_bible,
            direction=direction,
            emotion=emotion,
            intensity=intensity,
            sabotage=sabotage,
        )
        return [BranchOut(title=b.title, scene=b.scene) for b in raw_branches]

    def generate_dialogue(
        self,
        story_id: int,
        character: str,
        situation: str,
        emotion: str = "calm",
        intensity: int = 5,
    ) -> list[DialogueOptionOut]:
        """Generate 3 in-voice dialogue options for a character in a specific situation."""
        relevant_bible = self.get_grounding_facts(story_id, query_text=situation, character=character)
        options = model_adapter.write_dialogue(
            bible=relevant_bible,
            character=character,
            situation=situation,
            emotion=emotion,
            intensity=intensity,
        )
        return [
            DialogueOptionOut(
                line=o.line,
                underlying_emotion=o.underlying_emotion,
                intensity=o.intensity,
                why_in_voice=o.why_in_voice,
            )
            for o in options
        ]

    async def stream_scene_generation(
        self,
        story_id: int,
        direction: str,
        emotion: str = "calm",
        intensity: int = 5,
    ) -> AsyncGenerator[str, None]:
        """Stream next scene generation in chunks to the client."""
        relevant_bible = self.get_grounding_facts(story_id, query_text=direction)
        branches = model_adapter.generate_branches(
            bible=relevant_bible,
            direction=direction,
            emotion=emotion,
            intensity=intensity,
        )
        full_text = branches[0].scene if branches else "The story continues as the mist clears..."

        # Stream words/tokens progressively
        words = full_text.split(" ")
        for i, word in enumerate(words):
            chunk = word if i == 0 else " " + word
            yield chunk
