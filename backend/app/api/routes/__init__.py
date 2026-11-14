from app.api.routes.auth import router as auth_router
from app.api.routes.stories import router as stories_router
from app.api.routes.chapters import router as chapters_router
from app.api.routes.bible import router as bible_router, rules_router
from app.api.routes.flags import router as flags_router
from app.api.routes.generate import router as generate_router, voice_router
from app.api.routes.demo import router as demo_router
from app.api.routes.live import router as live_router

__all__ = [
    "auth_router",
    "stories_router",
    "chapters_router",
    "bible_router",
    "rules_router",
    "flags_router",
    "generate_router",
    "voice_router",
    "demo_router",
    "live_router",
]

