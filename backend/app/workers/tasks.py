from celery import Celery

from app.core.config import settings

celery_app = Celery("prd_portal", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.conf.broker_connection_retry_on_startup = True


@celery_app.task(name="run_ai_pipeline", bind=True, max_retries=3)
def run_ai_pipeline(self, source_file_id: int):
    import asyncio
    from app.pipeline.orchestrator import process_source_file
    try:
        asyncio.run(process_source_file(source_file_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
