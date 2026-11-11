"""GET /stories/{id}/flags, PATCH /stories/{id}/flags/{flag_id}."""
from typing import Annotated, Sequence
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import get_user_story
from app.db.session import get_db
from app.models.flag import Flag
from app.models.story import Story
from app.schemas.flag import FlagOut, FlagUpdate

router = APIRouter(prefix="/stories/{id}/flags", tags=["Continuity Flags"])


@router.get("", response_model=list[FlagOut])
def list_story_flags(
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
    flag_status: str | None = Query(default=None, alias="status"),
) -> list[FlagOut]:
    """List detected contradictions with both source quotes and chapter numbers (FR-2)."""
    stmt = select(Flag).where(Flag.story_id == story.id)
    if flag_status:
        stmt = stmt.where(Flag.status == flag_status)
    stmt = stmt.order_by(Flag.chapter_number.asc(), Flag.id.asc())

    flags: Sequence[Flag] = db.scalars(stmt).all()
    return [FlagOut.model_validate(f) for f in flags]


@router.patch("/{flag_id}", response_model=FlagOut)
def update_flag_status(
    flag_id: int,
    payload: FlagUpdate,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> FlagOut:
    """Dismiss or resolve an active continuity flag."""
    flag = db.scalar(
        select(Flag).where(Flag.id == flag_id, Flag.story_id == story.id)
    )
    if not flag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flag {flag_id} not found in this story",
        )

    valid_statuses = {"open", "dismissed", "resolved"}
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Must be one of: {valid_statuses}",
        )

    flag.status = payload.status
    db.commit()
    db.refresh(flag)
    return FlagOut.model_validate(flag)
