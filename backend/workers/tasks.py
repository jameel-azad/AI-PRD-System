"""
Legacy Celery worker entry-point (backend/workers/).

The active processing path is backend/app/workers/tasks.py::run_ai_pipeline,
which is what the API dispatches. These tasks are kept so that any existing
queued messages are not lost, but each one delegates to process_source_file()
from the current pipeline orchestrator rather than the old service-instance
approach (transcription_service / extraction_service / prd_engine) which no
longer exists.
"""

import asyncio
import logging

from workers.celery_app import app

logger = logging.getLogger(__name__)


def _run_pipeline(source_file_id: int) -> None:
    from app.pipeline.orchestrator import process_source_file
    asyncio.run(process_source_file(source_file_id))


@app.task(bind=True, max_retries=3)
def transcribe_file(self, source_file_id: int, storage_key: str = ""):
    """Delegated: runs the full pipeline for the given source file."""
    try:
        _run_pipeline(source_file_id)
    except Exception as exc:
        logger.exception("transcribe_file failed for source_file_id=%s", source_file_id)
        raise self.retry(exc=exc, countdown=30)


@app.task(bind=True, max_retries=3)
def extract_requirements(self, source_file_id: int):
    """Delegated: runs the full pipeline (extraction already handled inside orchestrator)."""
    try:
        _run_pipeline(source_file_id)
    except Exception as exc:
        logger.exception("extract_requirements failed for source_file_id=%s", source_file_id)
        raise self.retry(exc=exc, countdown=30)


@app.task(bind=True, max_retries=3)
def check_and_generate_prd(self, source_file_id: int):
    """Delegated: runs the full pipeline for the resolved source file."""
    try:
        _run_pipeline(source_file_id)
    except Exception as exc:
        logger.exception("check_and_generate_prd failed for source_file_id=%s", source_file_id)
        raise self.retry(exc=exc, countdown=30)


@app.task(bind=True, max_retries=3)
def generate_prd(self, project_id: int):
    """
    Old task dispatched with a project_id rather than a source_file_id.
    Finds the most-recent SourceFile for the project and reruns the pipeline.
    """
    try:
        async def _run():
            from sqlalchemy import select, desc
            from app.core.database import AsyncSessionLocal
            from app.models.source_file import SourceFile
            from app.pipeline.orchestrator import process_source_file

            async with AsyncSessionLocal() as session:
                row = (
                    await session.execute(
                        select(SourceFile)
                        .where(SourceFile.project_id == project_id)
                        .order_by(desc(SourceFile.id))
                        .limit(1)
                    )
                ).scalars().first()

            if row is None:
                logger.warning("generate_prd: no SourceFile found for project_id=%s", project_id)
                return

            await process_source_file(row.id)

        asyncio.run(_run())
    except Exception as exc:
        logger.exception("generate_prd failed for project_id=%s", project_id)
        raise self.retry(exc=exc, countdown=30)
