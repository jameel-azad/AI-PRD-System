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
    MINIO_USE_SSL: bool = False 

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-pro"
    GEMINI_EMBEDDING_MODEL: str = "models/embedding-001"

    OPENAI_API_KEY: str = ""
    OPENAI_WHISPER_MODEL: str = "whisper-1"

    LANGGRAPH_LLM: str = "gemini"       # "gemini" | "claude"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"

    # ── Email / SMTP ──────────────────────────────────────────────────
    SMTP_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USE_TLS: bool = True
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@xccelera.ai"

    # ── App URL (used in email links) ─────────────────────────────────
    APP_BASE_URL: str = "http://localhost:5173"

    # ── CORS allowed origins (comma-separated) ────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173"

    # ── Live web search (optional — used by feasibility agent) ────────
    # Set TAVILY_API_KEY to enable live sanctions/regulatory search.
    # Without it, the web_search tool returns a clearly-marked stub result.
    TAVILY_API_KEY: str = ""

    # ── Registration gate ─────────────────────────────────────────────
    # Set to false in production to block self-registration entirely.
    # Accounts must then be created by an admin via the team management API.
    REGISTRATION_OPEN: bool = True

    def validate_required_keys(self) -> None:
        """Called at startup — fails fast with a clear error if keys are missing."""
        if not self.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set in .env")
        if not self.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not set in .env — required for Whisper transcription")


settings = Settings()
