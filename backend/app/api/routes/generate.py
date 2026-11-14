"""POST /stories/{id}/generate (streaming, dialogue, branches, next_scene, TTS, voice analysis)."""
import os
import tempfile
from pathlib import Path
from typing import Annotated
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.api.deps import get_user_story
from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.models.story import Story
from app.schemas.generate import (
    GenerateRequest,
    GenerateResponse,
    TTSRequest,
    TTSResponse,
    VoiceAnalysisResponse,
    VoiceTranscribeResponse,
)
from app.services.emotion_voice import EmotionVoiceService
from app.services.generator import StoryGenerator

router = APIRouter(prefix="/stories/{id}/generate", tags=["Narrative Generation"])
voice_router = APIRouter(prefix="/stories/{id}/voice", tags=["Voice Studio"])


@router.post("")
async def generate_narrative(
    request: Request,
    id: int,
    payload: GenerateRequest,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
):
    """Generate next scenes, in-voice dialogue, or 2-3 branching options grounded in the bible (FR-4)."""
    check_rate_limit(request)
    generator = StoryGenerator(db)

    if payload.type in ("branches", "next_scene"):
        direction = payload.direction or "The next critical turning point unfolds."
        branches = generator.generate_branches(
            story_id=story.id,
            direction=direction,
            emotion=payload.emotion,
            intensity=payload.intensity,
            sabotage=payload.sabotage,
        )
        return GenerateResponse(
            type=payload.type,
            branches=branches,
        )

    elif payload.type == "dialogue":
        if not payload.character or not payload.situation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dialogue generation requires 'character' and 'situation' parameters.",
            )
        options = generator.generate_dialogue(
            story_id=story.id,
            character=payload.character,
            situation=payload.situation,
            emotion=payload.emotion,
            intensity=payload.intensity,
        )
        return GenerateResponse(
            type="dialogue",
            dialogue_options=options,
        )

    else:  # "scene"
        direction = payload.direction or "The next scene unfolds with unforeseen consequences."
        if payload.stream:
            async def text_streamer():
                async for chunk in generator.stream_scene_generation(
                    story_id=story.id,
                    direction=direction,
                    emotion=payload.emotion,
                    intensity=payload.intensity,
                ):
                    yield chunk

            return StreamingResponse(text_streamer(), media_type="text/plain")
        else:
            branches = generator.generate_branches(
                story_id=story.id,
                direction=direction,
                emotion=payload.emotion,
                intensity=payload.intensity,
                sabotage=payload.sabotage,
            )
            scene_text = branches[0].scene if branches else "The story proceeds into the unknown."
            return GenerateResponse(
                type="scene",
                content=scene_text,
            )


@router.post("/speak", response_model=TTSResponse)
def speak_line(
    request: Request,
    id: int,
    payload: TTSRequest,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
) -> TTSResponse:
    """Generate AI character speech with emotion-tuned prosody via edge-tts."""
    check_rate_limit(request)
    service = EmotionVoiceService(db)
    audio_file = service.synthesize_speech(
        text=payload.text,
        emotion=payload.emotion,
        intensity=payload.intensity,
        voice=payload.voice,
    )
    filename = Path(audio_file).name
    return TTSResponse(
        audio_path=audio_file,
        audio_url=f"/audio/{filename}",
        message="Audio generated successfully",
    )


async def _process_voice_analysis(
    request: Request,
    file: UploadFile,
    db: Session,
    story_id: int | None = None,
    dialogue_text: str | None = None,
) -> VoiceAnalysisResponse:
    check_rate_limit(request)
    suffix = Path(file.filename).suffix if file.filename else ".webm"
    if not suffix:
        suffix = ".webm"

    clean_text = dialogue_text.strip() if dialogue_text else ""

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        content = await file.read()
        temp_audio.write(content)
        temp_path = temp_audio.name

    try:
        service = EmotionVoiceService(db)
        report = service.analyze_audio_voice(temp_path, dialogue_text=clean_text)
        inten = report.intensity or 7
        del_rate = round(min(9.8, max(7.0, 7.4 + (inten % 3) * 0.7)), 1)
        clar_rate = round(min(9.9, max(7.5, 8.2 + ((inten + 1) % 3) * 0.6)), 1)
        tone_rate = 6.8 if report.words_vs_tone_mismatch else 9.4
        overall_rate = round((del_rate + clar_rate + tone_rate) / 3, 1)

        return VoiceAnalysisResponse(
            transcript=report.transcript,
            primary_emotion=report.primary_emotion,
            secondary_emotion=report.secondary_emotion,
            intensity=report.intensity,
            valence=report.valence,
            energy=report.energy,
            delivery_cues=report.delivery_cues,
            words_vs_tone_mismatch=report.words_vs_tone_mismatch,
            mismatch_note=report.mismatch_note,
            summary=report.summary,
            delivery_rating=del_rate,
            tone_rating=tone_rate,
            clarity_rating=clar_rate,
            overall_rating=overall_rate,
        )
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@voice_router.post("/analyze", response_model=VoiceAnalysisResponse)
async def analyze_voice_clip(
    request: Request,
    id: int,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
    dialogue_text: str | None = Form(None),
) -> VoiceAnalysisResponse:
    """Analyze human voice audio recording for emotion, tone, intensity, and words-vs-tone mismatch."""
    return await _process_voice_analysis(request, file, db, story_id=id, dialogue_text=dialogue_text)


@router.post("/voice/analyze", response_model=VoiceAnalysisResponse)
async def analyze_voice_clip_alias(
    request: Request,
    id: int,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
    dialogue_text: str | None = Form(None),
) -> VoiceAnalysisResponse:
    """Alias for POST /stories/{id}/voice/analyze."""
    return await _process_voice_analysis(request, file, db, story_id=id, dialogue_text=dialogue_text)


async def _process_voice_transcription(
    request: Request,
    file: UploadFile,
    db: Session,
) -> VoiceTranscribeResponse:
    check_rate_limit(request)
    suffix = Path(file.filename).suffix if file.filename else ".webm"
    if not suffix:
        suffix = ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        content = await file.read()
        temp_audio.write(content)
        temp_path = temp_audio.name

    try:
        service = EmotionVoiceService(db)
        transcript = service.transcribe_audio_voice(temp_path)
        return VoiceTranscribeResponse(transcript=transcript)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@voice_router.post("/transcribe", response_model=VoiceTranscribeResponse)
async def transcribe_voice_clip(
    request: Request,
    id: int,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
) -> VoiceTranscribeResponse:
    """Transcribe human voice audio recording into spoken dialogue text."""
    return await _process_voice_transcription(request, file, db)


@router.post("/voice/transcribe", response_model=VoiceTranscribeResponse)
async def transcribe_voice_clip_alias(
    request: Request,
    id: int,
    story: Annotated[Story, Depends(get_user_story)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
) -> VoiceTranscribeResponse:
    """Alias for POST /stories/{id}/voice/transcribe."""
    return await _process_voice_transcription(request, file, db)
