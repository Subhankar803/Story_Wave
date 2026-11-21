"""FastAPI entrypoint: app factory, CORS, routers, rate limiting, and frontend serving."""
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure backend root is on sys.path for direct module resolution
_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.api.routes import (
    auth_router,
    bible_router,
    rules_router,
    chapters_router,
    demo_router,
    flags_router,
    generate_router,
    live_router,
    stories_router,
    voice_router,
)
from app.core.config import settings
from app.core.logging import logger
from app.db.base import Base
from app.db.session import engine

frontend_dir = Path(__file__).resolve().parent.parent.parent / "Frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create tables for SQLite development / test mode
    logger.info("Initializing Story Wave database schema...")
    Base.metadata.create_all(bind=engine)
    try:
        from app.models.user import User
        from app.core.security import get_password_hash
        from app.db.session import SessionLocal
        from sqlalchemy import select
        with SessionLocal() as db:
            if not db.scalar(select(User).where(User.email == "writer@storywave.ai")):
                demo_user = User(
                    email="writer@storywave.ai",
                    password_hash=get_password_hash("password123"),
                )
                db.add(demo_user)
                db.commit()
                logger.info("Default author user seeded into SQLite users table.")
    except Exception as e:
        logger.warning(f"Could not seed default user: {e}")

    logger.info("Story Wave backend started successfully.")
    yield
    logger.info("Shutting down Story Wave backend...")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Story Wave API",
        description="GenAI co-writer and narrative consistency assistant for long-form fiction and multiverses.",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Configure CORS - allow all origins for local dev and frontend integrations
    origins = settings.CORS_ORIGINS
    if isinstance(origins, str):
        origins = [origins]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins != ["*"] else ["*"],
        allow_credentials=True if origins != ["*"] else False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register Routers
    app.include_router(auth_router)
    app.include_router(stories_router)
    app.include_router(chapters_router)
    app.include_router(bible_router)
    app.include_router(rules_router)
    app.include_router(flags_router)
    app.include_router(generate_router)
    app.include_router(voice_router)
    app.include_router(demo_router)
    app.include_router(live_router)

    # Serve static frontend assets if Frontend directory exists
    if frontend_dir.exists():
        no_cache_headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }

        # Static files serving helper
        frontend_files = [
            "style.css", "script.js", "index.html",
            "overview.html", "overview.css", "overview.js",
            "login.html", "login.css", "login.js",
            "register.html", "register.css", "register.js",
            "404.html", "favicon.svg"
        ]

        def _serve_file(file_path: Path, media_type: str):
            return lambda: FileResponse(file_path, media_type=media_type, headers=no_cache_headers)

        for filename in frontend_files:
            target_path = frontend_dir / filename
            if target_path.exists():
                media_type = "text/html" if filename.endswith(".html") else (
                    "text/css" if filename.endswith(".css") else (
                        "application/javascript" if filename.endswith(".js") else (
                            "image/svg+xml" if filename.endswith(".svg") else "application/octet-stream"
                        )
                    )
                )
                app.add_api_route(
                    f"/{filename}",
                    _serve_file(target_path, media_type),
                    methods=["GET"],
                    include_in_schema=False,
                )

        @app.get("/app", include_in_schema=False)
        def get_app():
            return FileResponse(frontend_dir / "index.html", media_type="text/html", headers=no_cache_headers)

    # Mount Story Wave Soundscape API
    try:
        from app.services.soundscape import get_soundscape_service
        get_soundscape_service()
        from soundscape_app.main import app as soundscape_app
        app.mount("/soundscape", soundscape_app)
        logger.info("Mounted story-wave-soundscape API at /soundscape")
    except Exception as e:
        logger.warning(f"Could not mount soundscape app: {e}")

    @app.get("/audio/{filename}", include_in_schema=False)
    def get_audio(filename: str):
        candidates = [
            Path(tempfile.gettempdir()) / filename,
            Path(tempfile.gettempdir()) / "sw_soundscape_data" / "out" / filename,
            Path(__file__).resolve().parent.parent / "story-wave-soundscape" / "data" / "out" / filename,
        ]
        target = next((c for c in candidates if c.exists()), None)
        if not target:
            raise HTTPException(status_code=404, detail="Audio file not found")
        media_type = "audio/wav" if filename.lower().endswith(".wav") else "audio/mpeg"
        return FileResponse(target, media_type=media_type)

    @app.get("/health", tags=["Health"])
    def health_check():
        return {"status": "ok", "app": "Story Wave", "version": "1.0.0"}

    @app.get("/", tags=["Health"])
    def root(request: Request):
        accept = request.headers.get("accept", "")
        if "application/json" in accept and "text/html" not in accept:
            return {
                "name": "Story Wave API",
                "docs": "/docs",
                "version": "1.0.0",
                "description": "GenAI narrative co-writer and story bible continuity assistant",
            }
        overview_file = frontend_dir / "overview.html"
        index_file = frontend_dir / "index.html"
        home_target = overview_file if overview_file.exists() else index_file
        if home_target.exists():
            return FileResponse(
                home_target,
                media_type="text/html",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return {
            "name": "Story Wave API",
            "docs": "/docs",
            "version": "1.0.0",
            "description": "GenAI narrative co-writer and story bible continuity assistant",
        }

    # 404 handler: serve 404.html for browser navigation requests
    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc):
        accept = request.headers.get("accept", "")
        file_404 = frontend_dir / "404.html"
        if "text/html" in accept and file_404.exists():
            return FileResponse(file_404, status_code=404, media_type="text/html")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    return app


app = create_app()
