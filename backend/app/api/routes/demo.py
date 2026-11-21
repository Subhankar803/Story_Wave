"""POST /stories/{id}/demo."""
from typing import Annotated
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_user_story
from app.db.session import get_db
from app.demo.sample_story import load_demo_story
from app.models.story import Story

router = APIRouter(prefix="/stories/{id}/demo", tags=["Demo Story"])


@router.post("", status_code=status.HTTP_200_OK)
def trigger_demo_story(
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
    chapter_count: int = Query(default=4, ge=1, le=10),
    title: str | None = Query(default=None),
) -> dict:
    """Load sample story with planted contradictions with customizable chapter count and title (FR-5)."""
    return load_demo_story(db, story.id, chapter_count=chapter_count, title=title)
