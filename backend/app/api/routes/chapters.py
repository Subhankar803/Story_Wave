"""POST /stories/{id}/chapters, PUT /stories/{id}/chapters/{n}."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import get_user_story
from app.db.session import get_db
from app.models.chapter import Chapter
from app.models.story import Story
from app.schemas.chapter import ChapterCreate, ChapterOut, ChapterProcessResult, ChapterUpdate
from app.schemas.flag import FlagOut
from app.services.analysis_runner import AnalysisRunner

router = APIRouter(prefix="/stories/{id}/chapters", tags=["Chapters"])


@router.post("", response_model=ChapterProcessResult, status_code=status.HTTP_201_CREATED)
def submit_chapter(
    payload: ChapterCreate,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> ChapterProcessResult:
    """Submit a chapter: ingest, extract facts, check continuity, and update the story bible (FR-1, FR-2)."""
    if not payload.text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chapter text cannot be empty")

    if payload.number is not None:
        chapter_number = payload.number
        # Verify number isn't duplicated
        existing = db.scalar(
            select(Chapter).where(Chapter.story_id == story.id, Chapter.number == chapter_number)
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chapter {chapter_number} already exists. Use PUT /stories/{story.id}/chapters/{chapter_number} to edit it.",
            )
    else:
        max_num = db.scalar(
            select(func.max(Chapter.number)).where(Chapter.story_id == story.id)
        )
        chapter_number = (max_num or 0) + 1

    chapter = Chapter(
        story_id=story.id,
        number=chapter_number,
        text=payload.text,
        status="pending",
    )
    db.add(chapter)
    db.flush()

    runner = AnalysisRunner(db)
    facts_count, flags = runner.run_chapter_analysis(
        story_id=story.id,
        chapter_id=chapter.id,
        is_reanalysis=False,
    )

    db.refresh(chapter)
    flag_outs = [
        FlagOut(
            id=f.id,
            story_id=f.story_id,
            fact_id=f.fact_id,
            conflicting_fact_id=f.conflicting_fact_id,
            type=f.type,
            explanation=f.explanation,
            old_quote=f.old_quote,
            new_quote=f.new_quote,
            chapter_number=f.chapter_number,
            severity=f.severity,
            status=f.status,
            created_at=f.created_at,
        )
        for f in flags
    ]

    return ChapterProcessResult(
        chapter=ChapterOut.model_validate(chapter),
        extracted_facts_count=facts_count,
        flags_count=len(flags),
        flags=flag_outs,
    )


@router.put("/{n}", response_model=ChapterProcessResult)
def edit_chapter(
    n: int,
    payload: ChapterUpdate,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> ChapterProcessResult:
    """Edit a chapter and re-run continuity analysis, clearing stale facts and flags (FR-3)."""
    if not payload.text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chapter text cannot be empty")

    chapter = db.scalar(
        select(Chapter).where(Chapter.story_id == story.id, Chapter.number == n)
    )
    if not chapter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Chapter {n} not found in this story")

    chapter.text = payload.text
    db.flush()

    runner = AnalysisRunner(db)
    facts_count, flags = runner.run_chapter_analysis(
        story_id=story.id,
        chapter_id=chapter.id,
        is_reanalysis=True,
    )

    db.refresh(chapter)
    flag_outs = [
        FlagOut(
            id=f.id,
            story_id=f.story_id,
            fact_id=f.fact_id,
            conflicting_fact_id=f.conflicting_fact_id,
            type=f.type,
            explanation=f.explanation,
            old_quote=f.old_quote,
            new_quote=f.new_quote,
            chapter_number=f.chapter_number,
            severity=f.severity,
            status=f.status,
            created_at=f.created_at,
        )
        for f in flags
    ]

    return ChapterProcessResult(
        chapter=ChapterOut.model_validate(chapter),
        extracted_facts_count=facts_count,
        flags_count=len(flags),
        flags=flag_outs,
    )
