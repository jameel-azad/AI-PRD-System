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
    "image":    [".png", ".jpg", ".jpeg", ".webp"],
}
MAX_SIZES = {
    "audio":    500_000_000,
    "video":  1_000_000_000,
    "document":  50_000_000,
    "image":     20_000_000,
}
_EXT_MAP = {ext: t for t, exts in ALLOWED_TYPES.items() for ext in exts}


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
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > MAX_SIZES[file_type]:
        raise HTTPException(413, "File exceeds size limit")

    storage_key = f"projects/{project_id}/{file.filename}"
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
