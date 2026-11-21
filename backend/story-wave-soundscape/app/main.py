"""HTTP API.  Run with ONE worker process (one process = one model on the GPU):
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"""
from __future__ import annotations

import hmac
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .config import Settings, load_settings
from .service import JobRequest, QueueFull, Service, build_service


class BackgroundRequest(BaseModel):
    environment: str = Field(min_length=1, max_length=300, description="From your analysis model, e.g. 'busy fish market'")
    emotion: str = Field("calm", max_length=60)
    intensity: int = Field(5, ge=1, le=10)
    dialogue: str = Field("", max_length=2000, description="Optional context only")
    duration_seconds: float = Field(4.0, ge=1.0, description="Length of the returned wav (the base clip is looped)")
    ambience_prompt: Optional[str] = Field(None, max_length=300, description="Skip Gemini and use this prompt directly")
    seed: int = 0
    fade: bool = True


def create_app(settings: Optional[Settings] = None, service: Optional[Service] = None) -> FastAPI:
    settings = settings or load_settings()
    service = service or build_service(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        service.start()
        yield
        service.stop()

    app = FastAPI(title="Story Wave background sound", version="1.0.0", lifespan=lifespan)

    def auth(x_api_key: str = Header(default="")) -> None:
        if settings.api_key and not hmac.compare_digest(x_api_key, settings.api_key):
            raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")

    @app.get("/health")
    def health():
        ready = service.model_ready.is_set()
        body = {
            "status": "ok" if ready else ("error" if service.model_error else "loading"),
            "model_loaded": ready,
            "model_error": service.model_error,
            "pending_jobs": service.pending_count(),
            "dev_fake": settings.dev_fake,
        }
        return JSONResponse(body, status_code=200 if ready else 503)

    @app.post("/v1/background", status_code=202, dependencies=[Depends(auth)])
    def create_background(req: BackgroundRequest):
        if req.duration_seconds > settings.max_duration_seconds:
            raise HTTPException(422, f"duration_seconds must be <= {settings.max_duration_seconds:g}")
        try:
            job = service.submit(JobRequest(**req.model_dump()))
        except QueueFull:
            raise HTTPException(429, "Too many pending jobs, retry shortly", headers={"Retry-After": "30"})
        return {"job_id": job.id, "status": job.status, "status_url": f"/v1/jobs/{job.id}"}

    @app.get("/v1/jobs/{job_id}", dependencies=[Depends(auth)])
    def get_job(job_id: str):
        job = service.get(job_id)
        if job is None:
            raise HTTPException(404, "Unknown or expired job")
        return job.public()

    @app.get("/v1/jobs/{job_id}/audio", dependencies=[Depends(auth)])
    def get_audio(job_id: str):
        job = service.get(job_id)
        if job is None:
            raise HTTPException(404, "Unknown or expired job")
        if job.status != "done" or not job.audio_path:
            raise HTTPException(409, f"Audio not ready (status: {job.status})")
        return FileResponse(job.audio_path, media_type="audio/wav", filename=f"background_{job.id[:8]}.wav")

    return app


app = create_app()
