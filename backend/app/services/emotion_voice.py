"""Emotion analysis, voice analysis and TTS wrappers around the model."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.fact import Fact
from app.services import model_adapter


class EmotionVoiceService:
    """Service wrapping emotional analysis, audio voice analysis, and text-to-speech."""

    def __init__(self, db: Session | None = None):
        self.db = db

    def analyze_dialogue_emotion(self, story_id: int, text: str, chapter_number: int):
        """Analyze dialogue emotional depth, subtext, and voice consistency against story bible."""
        bible: list[model_adapter.Fact] = []
        if self.db:
            facts = self.db.scalars(select(Fact).where(Fact.story_id == story_id)).all()
            bible = model_adapter.db_facts_to_model_bible(list(facts))
        return model_adapter.analyze_emotion(bible, text, chapter_number)

    def analyze_audio_voice(self, audio_file_path: str, dialogue_text: str | None = None):
        """Perform tone and emotional analysis on an audio clip."""
        return model_adapter.analyze_voice(audio_file_path, dialogue_text=dialogue_text)

    def transcribe_audio_voice(self, audio_file_path: str, context: str | None = None) -> str:
        """Transcribe human voice audio clip into dialogue text."""
        return model_adapter.transcribe_voice(audio_file_path, context=context)

    def synthesize_speech(
        self,
        text: str,
        emotion: str = "calm",
        intensity: int = 5,
        out_path: str | None = None,
        voice: str = "en-IN-NeerjaNeural",
    ) -> str:
        """Synthesize expressive character speech using edge-tts."""
        return model_adapter.speak(text, emotion, intensity, out_path=out_path, voice=voice)
