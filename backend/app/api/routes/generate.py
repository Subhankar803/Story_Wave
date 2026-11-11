"""POST /stories/{id}/generate (streaming)."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.api.deps import get_user_story
from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.models.story import Story
from app.schemas.generate import GenerateRequest, GenerateResponse, TTSRequest, TTSResponse
from app.services.emotion_voice import EmotionVoiceService
from app.services.generator import StoryGenerator

router = APIRouter(prefix="/stories/{id}/generate", tags=["Narrative Generation"])


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

    if payload.type == "branches":
        direction = payload.direction or "The next critical turning point unfolds."
        branches = generator.generate_branches(
            story_id=story.id,
            direction=direction,
            emotion=payload.emotion,
            intensity=payload.intensity,
            sabotage=payload.sabotage,
        )
        return GenerateResponse(
            type="branches",
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
    return TTSResponse(audio_path=audio_file, message="Audio generated successfully")
