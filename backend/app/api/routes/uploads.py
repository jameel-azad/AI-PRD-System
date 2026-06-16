from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.source_file import SourceFile
from app.models.user import User
from app.services.storage import storage_service

router = APIRouter(tags=["uploads"])

# Allowed extensions mapped to file_type enum values
_TYPE_MAP: dict[str, str] = {
    ".mp4": "video", ".mov": "video", ".avi": "video", ".mkv": "video", ".webm": "video",
    ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".ogg": "audio", ".flac": "audio",
    ".pdf": "document", ".docx": "document", ".doc": "document",
    ".pptx": "document", ".ppt": "document", ".xlsx": "document", ".xls": "document",
    ".json": "chat",
    ".txt": "text", ".md": "text",
}

MAX_BYTES = 500 * 1024 * 1024  # 500 MB


def detect_file_type(filename: str) -> str:
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    return _TYPE_MAP.get(ext, "text")


def validate_file(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    ext = ("." + file.filename.rsplit(".", 1)[-1].lower()) if "." in file.filename else ""
    if ext not in _TYPE_MAP:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed")
    if file.size and file.size > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 500 MB limit")


@router.post("/{project_id}/files")
async def upload_file(
    project_id: UUID,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    validate_file(file)

    storage_key = await storage_service.upload(file, str(project_id))

    source_file = SourceFile(
        project_id=project_id,
        file_name=file.filename,
        file_type=detect_file_type(file.filename),
        storage_key=storage_key,
    )
    db.add(source_file)
    await db.commit()
    await db.refresh(source_file)

    # Enqueue transcription as a Celery task
    from workers.tasks import transcribe_file
    transcribe_file.delay(str(source_file.id), storage_key)

    return {"id": source_file.id, "status": "processing"}
