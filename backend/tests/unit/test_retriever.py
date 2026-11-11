"""Unit tests for FactRetriever."""
import json
from sqlalchemy.orm import Session
from app.models.fact import Fact
from app.models.story import Story
from app.services.retriever import FactRetriever, cosine_similarity, simple_text_embedding


def test_embedding_and_similarity():
    v1 = simple_text_embedding("Aarav brown eyes Delhi")
    v2 = simple_text_embedding("Aarav brown eyes Delhi")
    v3 = simple_text_embedding("Spaceship asteroid galaxy")

    sim_same = cosine_similarity(v1, v2)
    sim_diff = cosine_similarity(v1, v3)

    assert sim_same > 0.99
    assert sim_diff < sim_same


def test_retrieve_similar_facts(db: Session, test_story: Story):
    retriever = FactRetriever(db)

    f1 = Fact(
        story_id=test_story.id,
        entity_name="Aarav",
        attribute="appearance",
        value="brown eyes",
        chapter_number=1,
        quote="He had brown eyes",
        embedding=json.dumps(retriever.compute_embedding("Aarav brown eyes")),
    )
    f2 = Fact(
        story_id=test_story.id,
        entity_name="Delhi",
        attribute="location",
        value="capital",
        chapter_number=1,
        quote="lived in Delhi",
        embedding=json.dumps(retriever.compute_embedding("Delhi capital")),
    )
    db.add_all([f1, f2])
    db.commit()

    retrieved = retriever.retrieve_similar_facts(
        story_id=test_story.id,
        target_entity="Aarav",
        top_k=5,
    )
    assert len(retrieved) >= 1
    assert retrieved[0].entity_name == "Aarav"

