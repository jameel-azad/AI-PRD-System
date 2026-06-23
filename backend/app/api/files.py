import shutil
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.user import User
from app.services.storage import storage_service

router = APIRouter()

ALLOWED_TYPES = {
    "audio":    [".mp3", ".wav", ".m4a", ".ogg"],
    "video":    [".mp4", ".mov", ".avi", ".mkv", ".webm"],
    "document": [".pdf", ".docx", ".txt", ".md"],
    # Images are intentionally excluded: text extraction requires OCR which
    # is not yet supported. Accepting images would silently produce 0 requirements.
}
MAX_SIZES = {
    "audio":    500_000_000,   # 500 MB
    "video":  1_000_000_000,   # 1 GB
    "document":  50_000_000,   # 50 MB
}
_EXT_MAP = {ext: t for t, exts in ALLOWED_TYPES.items() for ext in exts}


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@router.post("/{project_id}/upload")
async def upload_file(
    project_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied to this project")

    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    file_type = _EXT_MAP.get(ext)
    if not file_type:
        raise HTTPException(
            400,
            f"Unsupported file type: {ext!r}. "
            "Supported: audio (.mp3 .wav .m4a .ogg), "
            "video (.mp4 .mov .avi .mkv .webm), "
            "document (.pdf .docx .txt .md)"
        )

    # Fail fast before upload if ffmpeg is missing for audio/video
    if file_type in ("audio", "video") and not _ffmpeg_available():
        raise HTTPException(
            503,
            "Audio/video processing requires ffmpeg and ffprobe, which are not installed on this server. "
            "Install them (e.g. `choco install ffmpeg` on Windows or `apt install ffmpeg` on Linux) "
            "and restart the backend."
        )

    content = await file.read()
    if len(content) > MAX_SIZES[file_type]:
        raise HTTPException(413, f"File too large — max {MAX_SIZES[file_type] // 1_000_000} MB for {ext} files")

    # Use a UUID prefix so two uploads of the same filename never collide in MinIO
    uid = uuid.uuid4().hex[:12]
    storage_key = f"projects/{project_id}/{uid}_{file.filename}"
    await storage_service.upload_bytes(storage_key, content, file.content_type or "application/octet-stream")

    source_file = SourceFile(
        project_id=project_id,
        storage_key=storage_key,
        filename=file.filename,
        file_type=file_type,
        status="queued",
    )
    db.add(source_file)
    await db.commit()
    await db.refresh(source_file)

    from app.workers.tasks import run_ai_pipeline
    task = run_ai_pipeline.delay(source_file.id)

    return {"id": source_file.id, "filename": source_file.filename, "status": "queued", "task_id": task.id}


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    source_file = await db.get(SourceFile, file_id)
    if not source_file:
        raise HTTPException(404, "File not found")

    project = await db.get(Project, source_file.project_id)
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied to this file")

    try:
        await storage_service.delete(source_file.storage_key)
    except Exception:
        pass  # storage object may already be missing; proceed to remove DB record

    await db.delete(source_file)
    await db.commit()
