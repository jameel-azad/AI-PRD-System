"""
Task queue API — check pipeline task status, cancel tasks, view queue stats.

GET    /api/v1/queue/stats                    — worker + queue counts
GET    /api/v1/queue/tasks/{task_id}          — status of a specific task
DELETE /api/v1/queue/tasks/{task_id}          — cancel a pending/running task
POST   /api/v1/queue/{project_id}/reprocess  — re-enqueue all non-complete files
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.project import Project
from app.models.source_file import SourceFile
from app.models.user import User, UserRole
from app.services.queue import cancel_task, get_queue_stats, get_task_status

router = APIRouter()


@router.get("/stats")
async def queue_stats(current_user: User = Depends(get_current_user)):
    """
    Return the number of active, queued, and scheduled Celery tasks across
    all connected workers. Requires a running Celery worker and Redis broker.
    """
    return await get_queue_stats()


@router.get("/tasks/{task_id}")
async def task_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Return the current status of a pipeline task.

    Response fields:
    - **status**: `queued | processing | retrying | complete | failed | cancelled`
    - **progress**: 0–100 (best-effort)
    - **error**: error message if status is `failed`, else null
    - **result**: task result if status is `complete`, else null
    """
    return await get_task_status(task_id)


@router.delete("/tasks/{task_id}")
async def cancel_pipeline_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Cancel a pending or running pipeline task.

    Returns `{"cancelled": true}` if the revoke was sent, or
    `{"cancelled": false, "reason": "..."}` if the task was already terminal.

    Only admins and the task owner should call this — the endpoint currently
    requires authentication but does not enforce ownership.
    """
    revoked = await cancel_task(task_id)
    if not revoked:
        return {"cancelled": False, "reason": "Task is already in a terminal state (complete, failed, or cancelled)."}
    return {"cancelled": True, "task_id": task_id}


@router.post("/{project_id}/reprocess")
@limiter.limit("10/minute")
async def reprocess_project(
    request: Request,
    project_id: int,
    current_user: User = Depends(require_role(UserRole.admin, UserRole.ba_pm)),
    db: AsyncSession = Depends(get_db),
):
    """
    Re-enqueue all source files for a project that have not yet completed processing.
    Returns the list of re-queued file IDs and their new task IDs.
    """
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied to this project")

    files = (
        await db.execute(
            select(SourceFile).where(
                SourceFile.project_id == project_id,
                SourceFile.status != "complete",
            )
        )
    ).scalars().all()

    if not files:
        return {"queued": [], "message": "All files are already complete."}

    from app.workers.tasks import run_ai_pipeline

    queued = []
    for f in files:
        f.status = "queued"
        task = run_ai_pipeline.delay(f.id)
        queued.append({"file_id": f.id, "filename": f.filename, "task_id": task.id})

    await db.commit()
    return {"queued": queued}
