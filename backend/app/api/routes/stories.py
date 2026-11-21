"""POST/GET /stories, GET /stories/{id}, export & import."""
import re
from typing import Annotated, Any, Sequence
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel
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
from app.services import document_export

router = APIRouter(prefix="/stories", tags=["Stories"])


class ExportPayload(BaseModel):
    title: str | None = None
    chapters: list[dict[str, Any]] | None = None


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


@router.put("/{id}", response_model=StoryOut)
def update_story_title(
    payload: StoryCreate,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> StoryOut:
    """Update title of an existing story."""
    story.title = payload.title
    db.commit()
    db.refresh(story)
    return build_story_out(story, db)


@router.post("/export")
def export_story_document(
    format: str = Query(default="docx", pattern="^(docx|pdf|txt)$"),
    payload: ExportPayload | None = None,
) -> Response:
    """Export story directly from client payload to DOCX, PDF, or TXT without requiring auth."""
    title = (payload.title if payload and payload.title else None) or "Untitled Story"
    chapters = payload.chapters if payload and payload.chapters else None
    if not chapters:
        chapters = [{"number": 1, "title": "Chapter 1", "subtitle": "Scene", "content": ""}]

    fmt = format.lower()
    safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_') or "story"

    if fmt == "docx":
        data = document_export.export_docx(title, chapters)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"{safe_title}.docx"
    elif fmt == "pdf":
        data = document_export.export_pdf(title, chapters)
        media_type = "application/pdf"
        filename = f"{safe_title}.pdf"
    else:
        data = document_export.export_txt(title, chapters)
        media_type = "text/plain; charset=utf-8"
        filename = f"{safe_title}.txt"

    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{id}/export")
def export_story_document_by_id(
    id: int,
    format: str = Query(default="docx", pattern="^(docx|pdf|txt)$"),
    payload: ExportPayload | None = None,
    story: Story = Depends(get_user_story),
    db: Session = Depends(get_db),
) -> Response:
    """Export story from database (or overriding payload) to DOCX, PDF, or TXT."""
    title = (payload.title if payload and payload.title else None) or story.title or "Untitled Story"
    chapters = payload.chapters if payload and payload.chapters else None

    if not chapters:
        db_chapters = db.scalars(
            select(Chapter).where(Chapter.story_id == story.id).order_by(Chapter.number.asc())
        ).all()
        chapters = [
            {"number": ch.number, "title": f"Chapter {ch.number}", "subtitle": "Scene", "content": ch.text}
            for ch in db_chapters
        ]

    if not chapters:
        chapters = [{"number": 1, "title": "Chapter 1", "subtitle": "Scene", "content": ""}]

    fmt = format.lower()
    safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_') or "story"

    if fmt == "docx":
        data = document_export.export_docx(title, chapters)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"{safe_title}.docx"
    elif fmt == "pdf":
        data = document_export.export_pdf(title, chapters)
        media_type = "application/pdf"
        filename = f"{safe_title}.pdf"
    else:
        data = document_export.export_txt(title, chapters)
        media_type = "text/plain; charset=utf-8"
        filename = f"{safe_title}.txt"

    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_story_document(
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Import DOCX, PDF, or TXT file into story title and chapters."""
    content = await file.read()
    result = document_export.import_file(content, file.filename or "story.txt")
    return {
        "title": result["title"],
        "chapters": result["chapters"],
        "filename": file.filename,
        "message": f"Successfully parsed {len(result['chapters'])} chapters from {file.filename}."
    }
