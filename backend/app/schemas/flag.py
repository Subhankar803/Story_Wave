"""Flag schemas."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class FlagOut(BaseModel):
    id: int
    story_id: int
    fact_id: int | None = None
    conflicting_fact_id: int | None = None
    type: str
    explanation: str
    old_quote: str
    new_quote: str
    chapter_number: int
    severity: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FlagUpdate(BaseModel):
    status: str  # "open", "dismissed", "resolved"
