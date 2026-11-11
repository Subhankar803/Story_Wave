"""Story schemas."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class StoryCreate(BaseModel):
    title: str


class StoryUpdate(BaseModel):
    title: str | None = None


class StoryOut(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime
    chapter_count: int = 0
    fact_count: int = 0
    flag_count: int = 0

    model_config = ConfigDict(from_attributes=True)
