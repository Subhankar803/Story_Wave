"""Settings from environment variables."""
import json
from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_CANONICAL_DB_FILE = (_PROJECT_ROOT / "story_wave.db").resolve().as_posix()


class Settings(BaseSettings):
    PROJECT_NAME: str = "Story Wave"
    API_V1_STR: str = ""
    SECRET_KEY: str = "story_wave_jwt_secret_key_production_default_change_me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    DATABASE_URL: str = f"sqlite:///{_CANONICAL_DB_FILE}"
    GEMINI_API_KEY: str | None = None
    GOOGLE_API_KEY: str | None = None

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_database_url(cls, v: str | None) -> str:
        # If SQLite or story_wave.db is referenced, always bind to project root story_wave.db
        if not v or "story_wave.db" in str(v) or str(v).startswith("sqlite:///."):
            return f"sqlite:///{_CANONICAL_DB_FILE}"
        return v

    @property
    def effective_gemini_api_key(self) -> str | None:
        import os
        return self.GEMINI_API_KEY or self.GOOGLE_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    CORS_ORIGINS: Union[List[str], str] = ["*"]
    RATE_LIMIT_PER_MINUTE: int = 60
    USE_NLI_FILTER: bool = False
    EMBEDDINGS_MODEL: str = "gemini"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, str) and v.startswith("["):
            try:
                return json.loads(v)
            except Exception:
                return [v]
        elif isinstance(v, list):
            return v
        return ["*"]

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
