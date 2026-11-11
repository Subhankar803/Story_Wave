"""FastAPI entrypoint: app factory, CORS, routers, rate limiting."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

    # Configure CORS
    origins = settings.CORS_ORIGINS
    if isinstance(origins, str):
        origins = [origins]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
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

    @app.get("/health", tags=["Health"])
    def health_check():
        return {"status": "ok", "app": "Story Wave", "version": "1.0.0"}

    @app.get("/", tags=["Health"])
    def root():
        return {
            "name": "Story Wave API",
            "docs": "/docs",
            "version": "1.0.0",
            "description": "GenAI narrative co-writer and story bible continuity assistant",
        }

    return app


app = create_app()
