"""FastAPI entrypoint: app factory, CORS, routers, rate limiting, and frontend serving."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.api.routes import (
    auth_router,
    bible_router,
    chapters_router,
    demo_router,
    flags_router,
    generate_router,
    live_router,
    stories_router,
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
    app.include_router(flags_router)
    app.include_router(generate_router)
    app.include_router(demo_router)
    app.include_router(live_router)

    # Serve static frontend assets if Frontend directory exists
    if frontend_dir.exists():
        style_path = frontend_dir / "style.css"
        script_path = frontend_dir / "script.js"
        index_path = frontend_dir / "index.html"

        if style_path.exists():
            @app.get("/style.css", include_in_schema=False)
            def get_style():
                return FileResponse(style_path, media_type="text/css")

        if script_path.exists():
            @app.get("/script.js", include_in_schema=False)
            def get_script():
                return FileResponse(script_path, media_type="application/javascript")

        if index_path.exists():
            @app.get("/app", include_in_schema=False)
            def get_app():
                return FileResponse(index_path, media_type="text/html")

    @app.get("/health", tags=["Health"])
    def health_check():
        return {"status": "ok", "app": "Story Wave", "version": "1.0.0"}

    @app.get("/", tags=["Health"])
    def root(request: Request):
        accept = request.headers.get("accept", "")
        index_file = frontend_dir / "index.html"
        if "text/html" in accept and index_file.exists():
            return FileResponse(index_file, media_type="text/html")
        return {
            "name": "Story Wave API",
            "docs": "/docs",
            "version": "1.0.0",
            "description": "GenAI narrative co-writer and story bible continuity assistant",
        }

    return app


app = create_app()
