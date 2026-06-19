"""
Task queue API — check pipeline task status, cancel tasks, view queue stats.

GET    /api/v1/queue/stats            — worker + queue counts
GET    /api/v1/queue/tasks/{task_id}  — status of a specific task
DELETE /api/v1/queue/tasks/{task_id}  — cancel a pending/running task
"""
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.models.user import User
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
