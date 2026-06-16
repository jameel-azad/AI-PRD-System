from workers.celery_app import app
from workers import db as worker_db


@app.task(bind=True, max_retries=3)
def transcribe_file(self, source_file_id: str, storage_key: str):
    try:
        from app.services.transcription import transcription_service

        sf = worker_db.get_source_file(source_file_id)
        # Text/chat files don't need Whisper — read bytes directly
        if sf and sf.file_type in ("text", "chat", "document"):
            result = transcription_service.run_for_text(storage_key)
        else:
            result = transcription_service.run(storage_key)

        worker_db.update_source_file(source_file_id, transcript=result["full_text"], status="done")
        extract_requirements.delay(source_file_id)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@app.task
def extract_requirements(source_file_id: str):
    from app.services.extraction import extraction_service

    transcript = worker_db.get_transcript(source_file_id)
    requirements = extraction_service.run(transcript, source_file_id)
    worker_db.save_requirements(requirements, source_file_id)
    check_and_generate_prd.delay(source_file_id)


@app.task
def check_and_generate_prd(source_file_id: str):
    """Resolve project_id from source_file and trigger PRD generation."""
    sf = worker_db.get_source_file(source_file_id)
    if sf and sf.project_id:
        generate_prd.delay(str(sf.project_id))


@app.task
def generate_prd(project_id: str):
    from app.services.prd_engine import prd_engine

    requirements = worker_db.get_all_requirements(project_id)
    prd = prd_engine.generate(requirements)
    worker_db.save_prd_version(project_id, prd)
