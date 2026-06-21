from celery import Celery
from app.core.config import settings

app = Celery(
    "prd_workers",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

app.conf.task_routes = {
    "workers.tasks.transcribe_file": {"queue": "transcription"},
    "workers.tasks.extract_requirements": {"queue": "extraction"},
    "workers.tasks.generate_prd": {"queue": "prd"},
    "workers.tasks.check_and_generate_prd": {"queue": "prd"},
    "run_ai_pipeline": {"queue": "prd"},
}

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
