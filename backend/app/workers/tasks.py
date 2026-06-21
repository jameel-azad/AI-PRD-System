from workers.celery_app import app as celery_app


@celery_app.task(name="run_ai_pipeline", bind=True, max_retries=3)
def run_ai_pipeline(self, source_file_id: int):
    import asyncio
    from app.pipeline.orchestrator import process_source_file
    try:
        asyncio.run(process_source_file(source_file_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
