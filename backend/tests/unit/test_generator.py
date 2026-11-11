"""Unit tests for StoryGenerator."""
import pytest
from sqlalchemy.orm import Session
from app.models.fact import Fact
from app.models.story import Story
from app.services.generator import StoryGenerator


def test_generator_branches(db: Session, test_story: Story):
    generator = StoryGenerator(db)
    branches = generator.generate_branches(
        story_id=test_story.id,
        direction="Aarav decides to confront the shadowed figure",
        emotion="suspense",
        intensity=7,
    )
    assert len(branches) == 3
    for b in branches:
        assert b.title
        assert b.scene


def test_generator_dialogue(db: Session, test_story: Story):
    generator = StoryGenerator(db)
    options = generator.generate_dialogue(
        story_id=test_story.id,
        character="Aarav",
        situation="Questioning his grandmother about the old watch",
        emotion="melancholy",
        intensity=6,
    )
    assert len(options) == 3
    for opt in options:
        assert opt.line
        assert opt.underlying_emotion
        assert opt.why_in_voice


@pytest.mark.asyncio
async def test_generator_streaming(db: Session, test_story: Story):
    generator = StoryGenerator(db)
    chunks = []
    async for chunk in generator.stream_scene_generation(
        story_id=test_story.id,
        direction="Aarav opens the brass chest",
    ):
        chunks.append(chunk)

    full_output = "".join(chunks)
    assert len(full_output) > 10

