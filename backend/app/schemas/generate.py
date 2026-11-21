"""Generation request/response schemas (scene, dialogue, branches)."""
from typing import Any, Literal
from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    type: Literal["scene", "dialogue", "branches", "next_scene"] = "scene"
    direction: str | None = Field(default=None, description="Prompt/direction of what happens next")
    character: str | None = Field(default=None, description="Character name for dialogue generation")
    situation: str | None = Field(default=None, description="Situation context for dialogue")
    canvas_context: str | None = Field(default=None, description="Current story text from canvas")
    emotion: str = Field(default="calm", description="Target emotional tone")
    intensity: int = Field(default=5, ge=1, le=10, description="Emotion intensity from 1 to 10")
    sabotage: bool = Field(default=False, description="DEMO ONLY: intentionally plant contradiction")
    stream: bool = Field(default=False, description="Whether to stream response chunks")


class BranchOut(BaseModel):
    title: str
    scene: str
    rating: str = "9.0"
    consistency: str = "95%"
    is_conflict: bool = False
    why: str = "Consistent with Story Bible"
    badge: str = "🟢 Highly Recommended"


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
    character: str | None = None
    environment: str | None = None
    situation: str | None = None
    context: str | None = None
    include_soundscape: bool = True


class TTSResponse(BaseModel):
    audio_path: str
    audio_url: str | None = None
    message: str
    soundscape_url: str | None = None
    soundscape_volume: float = 0.55
    soundscape_plan: dict[str, Any] | None = None


class VoiceTranscribeResponse(BaseModel):
    transcript: str


class VoiceAnalysisResponse(BaseModel):
    transcript: str
    primary_emotion: str
    secondary_emotion: str
    intensity: int
    valence: str
    energy: str
    delivery_cues: str
    words_vs_tone_mismatch: bool
    mismatch_note: str
    summary: str
    delivery_rating: float = 8.5
    tone_rating: float = 8.8
    clarity_rating: float = 9.0
    overall_rating: float = 8.8
