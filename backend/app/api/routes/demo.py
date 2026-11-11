"""POST /stories/{id}/demo."""
from typing import Annotated
from fastapi import APIRouter, Depends, status
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
) -> dict:
    """Load the pre-built sample story with planted contradictions of all four types in one call (FR-5)."""
    return load_demo_story(db, story.id)
