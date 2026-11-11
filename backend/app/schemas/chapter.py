"""Chapter schemas."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.flag import FlagOut


class ChapterCreate(BaseModel):
    number: int | None = None
    text: str


class ChapterUpdate(BaseModel):
    text: str


class ChapterOut(BaseModel):
    id: int
    story_id: int
    number: int
    text: str
    status: str
    error_message: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChapterProcessResult(BaseModel):
    chapter: ChapterOut
    extracted_facts_count: int
    flags_count: int
    flags: list[FlagOut] = []
