"""POST/GET /stories, GET /stories/{id}."""
from typing import Annotated, Sequence
from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_user_story
from app.db.session import get_db
from app.models.chapter import Chapter
from app.models.fact import Fact
from app.models.flag import Flag
from app.models.story import Story
from app.models.user import User
from app.schemas.story import StoryCreate, StoryOut

router = APIRouter(prefix="/stories", tags=["Stories"])


def build_story_out(story: Story, db: Session) -> StoryOut:
    ch_count = db.scalar(select(func.count(Chapter.id)).where(Chapter.story_id == story.id)) or 0
    fact_count = db.scalar(select(func.count(Fact.id)).where(Fact.story_id == story.id)) or 0
    flag_count = db.scalar(select(func.count(Flag.id)).where(Flag.story_id == story.id)) or 0
    return StoryOut(
        id=story.id,
        user_id=story.user_id,
        title=story.title,
        created_at=story.created_at,
        chapter_count=ch_count,
        fact_count=fact_count,
        flag_count=flag_count,
    )


@router.post("", response_model=StoryOut, status_code=status.HTTP_201_CREATED)
def create_story(
    payload: StoryCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StoryOut:
    """Create a new story workspace for the authenticated author."""
    story = Story(
        title=payload.title,
        user_id=current_user.id,
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return build_story_out(story, db)


@router.get("", response_model=list[StoryOut])
def list_stories(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[StoryOut]:
    """List all stories owned by the current authenticated author."""
    stories: Sequence[Story] = db.scalars(
        select(Story).where(Story.user_id == current_user.id).order_by(Story.created_at.desc())
    ).all()
    return [build_story_out(s, db) for s in stories]


@router.get("/{id}", response_model=StoryOut)
def get_story(
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> StoryOut:
    """Fetch details of a single story owned by the authenticated author."""
    return build_story_out(story, db)
