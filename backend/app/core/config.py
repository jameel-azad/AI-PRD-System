from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_root = Path(__file__).resolve().parents[3]
_env_file = _root / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_env_file) if _env_file.exists() else ".env",
        extra="ignore",
    )

    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "prd-files"

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    def validate_required_keys(self) -> None:
        """Called at startup — fails fast with a clear error if keys are missing."""
        if not self.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set in .env")
        if not self.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not set in .env — required for Whisper transcription")


settings = Settings()
