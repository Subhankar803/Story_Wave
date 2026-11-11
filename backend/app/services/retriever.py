"""Pipeline stage: embeddings + top-k similar facts (pgvector / similarity search)."""
import json
import math
from typing import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.logging import logger
from app.models.fact import Fact


def simple_text_embedding(text: str, dim: int = 128) -> list[float]:
    """Lightweight deterministic hashing embedding for fallback / dev environments."""
    words = text.lower().split()
    vector = [0.0] * dim
    if not words:
        return vector

    for i, w in enumerate(words):
        h = hash(w) % dim
        vector[h] += 1.0 / (1.0 + 0.1 * i)

    # Normalize to unit vector
    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0:
        vector = [x / norm for x in vector]
    return vector


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """Compute cosine similarity between two float vectors."""
    if len(v1) != len(v2) or not v1:
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


class FactRetriever:
    """Service for retrieving relevant story facts using entity filtering and vector similarity."""

    def __init__(self, db: Session):
        self.db = db

    def compute_embedding(self, text: str) -> list[float]:
        """Compute embedding vector for text."""
        return simple_text_embedding(text)

    def retrieve_similar_facts(
        self,
        story_id: int,
        target_entity: str | None = None,
        query_text: str | None = None,
        top_k: int = 10,
        exclude_chapter_number: int | None = None,
    ) -> list[Fact]:
        """Retrieve top-k relevant facts matching the target entity or query semantics."""
        stmt = select(Fact).where(Fact.story_id == story_id)
        if exclude_chapter_number is not None:
            stmt = stmt.where(Fact.chapter_number < exclude_chapter_number)

        all_facts: Sequence[Fact] = self.db.scalars(stmt).all()
        if not all_facts:
            return []

        # If entity specified, partition into exact entity match vs other facts
        matched_facts: list[Fact] = []
        other_facts: list[Fact] = []

        target_norm = target_entity.strip().lower() if target_entity else ""

        for f in all_facts:
            if target_norm and target_norm in f.entity_name.lower():
                matched_facts.append(f)
            else:
                other_facts.append(f)

        if not query_text:
            combined = matched_facts + other_facts
            return combined[:top_k]

        query_vec = self.compute_embedding(query_text)

        # Score facts
        def score_fact(f: Fact) -> float:
            score = 0.0
            if target_norm and target_norm in f.entity_name.lower():
                score += 1.0  # Heavy boost for entity match

            if f.embedding:
                try:
                    f_vec = json.loads(f.embedding)
                    sim = cosine_similarity(query_vec, f_vec)
                    score += sim
                except Exception:
                    pass
            return score

        scored = sorted(all_facts, key=score_fact, reverse=True)
        return scored[:top_k]
