"""Generation request/response schemas (scene, dialogue, branches)."""
from typing import Literal
from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    type: Literal["scene", "dialogue", "branches"] = "scene"
    direction: str | None = Field(default=None, description="Prompt/direction of what happens next")
    character: str | None = Field(default=None, description="Character name for dialogue generation")
    situation: str | None = Field(default=None, description="Situation context for dialogue")
    emotion: str = Field(default="calm", description="Target emotional tone")
    intensity: int = Field(default=5, ge=1, le=10, description="Emotion intensity from 1 to 10")
    sabotage: bool = Field(default=False, description="DEMO ONLY: intentionally plant contradiction")
    stream: bool = Field(default=False, description="Whether to stream response chunks")


class BranchOut(BaseModel):
    title: str
    scene: str


class DialogueOptionOut(BaseModel):
    line: str
    underlying_emotion: str
    intensity: int
    why_in_voice: str


class GenerateResponse(BaseModel):
    type: str
    content: str | None = None
    branches: list[BranchOut] | None = None
    dialogue_options: list[DialogueOptionOut] | None = None


class TTSRequest(BaseModel):
    text: str
    emotion: str = "calm"
    intensity: int = Field(default=5, ge=1, le=10)
    voice: str = "en-IN-NeerjaNeural"


class TTSResponse(BaseModel):
    audio_path: str
    message: str
