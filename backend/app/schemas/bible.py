"""Bible response schemas."""
from pydantic import BaseModel, ConfigDict


class EntityOut(BaseModel):
    id: int
    name: str
    type: str

    model_config = ConfigDict(from_attributes=True)


class FactOut(BaseModel):
    id: int
    entity_name: str
    attribute: str
    value: str
    chapter_number: int
    day: str | None = None
    quote: str

    model_config = ConfigDict(from_attributes=True)


class RuleOut(BaseModel):
    id: int
    description: str
    quote: str
    chapter_number: int

    model_config = ConfigDict(from_attributes=True)


class BibleOut(BaseModel):
    characters: list[EntityOut] = []
    places: list[EntityOut] = []
    objects: list[EntityOut] = []
    organizations: list[EntityOut] = []
    timeline: list[FactOut] = []
    rules: list[RuleOut] = []
    facts: list[FactOut] = []
    total_facts: int = 0
