"""
Task queue helpers — wrappers around Celery for submitting, inspecting,
and cancelling AI pipeline tasks.

All public functions are safe to call from FastAPI async route handlers.
Blocking Celery calls are wrapped in asyncio.to_thread.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Import the active Celery app (not the legacy workers/ one).
from app.workers.tasks import celery_app, run_ai_pipeline


# ── Status mapping ─────────────────────────────────────────────────────────────

_CELERY_STATE_MAP: dict[str, str] = {
    "PENDING":  "queued",
    "STARTED":  "processing",
    "RETRY":    "retrying",
    "SUCCESS":  "complete",
    "FAILURE":  "failed",
    "REVOKED":  "cancelled",
}


def _normalise_state(celery_state: str) -> str:
    return _CELERY_STATE_MAP.get(celery_state, celery_state.lower())


# ── Public API ─────────────────────────────────────────────────────────────────

def submit_file_processing(source_file_id: int) -> str:
    """
    Enqueue the AI pipeline for a SourceFile and return the Celery task ID.

    This is a synchronous call (Celery .delay() is not async) so it's safe
    to call directly from sync code or wrap in asyncio.to_thread if needed.
    """
    result = run_ai_pipeline.delay(source_file_id)
    logger.info("Queued pipeline task %s for source_file_id=%s", result.id, source_file_id)
    return result.id


async def get_task_status(task_id: str) -> dict[str, Any]:
    """
    Return a status dict for a Celery task.

    {
      "task_id":  str,
      "status":   "queued" | "processing" | "retrying" | "complete" | "failed" | "cancelled",
      "progress": 0–100  (best-effort estimate),
      "error":    str | None,
      "result":   any | None,
    }
    """
    def _get() -> dict:
        from celery.result import AsyncResult
        ar = AsyncResult(task_id, app=celery_app)
        state = ar.state

        error = None
        result = None
        progress = 0

        if state == "SUCCESS":
            result = ar.result
            progress = 100
        elif state == "FAILURE":
            error = str(ar.result) if ar.result else "Unknown error"
            progress = 0
        elif state == "STARTED":
            # If the task emits meta updates, extract progress; otherwise estimate 50 %.
            meta = ar.info or {}
            progress = meta.get("progress", 50) if isinstance(meta, dict) else 50
        elif state == "PENDING":
            progress = 0

        return {
            "task_id":  task_id,
            "status":   _normalise_state(state),
            "progress": progress,
            "error":    error,
            "result":   result,
        }

    return await asyncio.to_thread(_get)


async def cancel_task(task_id: str) -> bool:
    """
    Revoke (cancel) a pending or running Celery task.
    Returns True if the revoke was sent, False if the task was already terminal.
    """
    def _revoke() -> bool:
        from celery.result import AsyncResult
        ar = AsyncResult(task_id, app=celery_app)
        if ar.state in ("SUCCESS", "FAILURE", "REVOKED"):
            return False
        ar.revoke(terminate=True, signal="SIGTERM")
        logger.info("Revoked task %s", task_id)
        return True

    return await asyncio.to_thread(_revoke)


async def get_queue_stats() -> dict[str, Any]:
    """
    Return active/reserved/scheduled task counts for all connected workers.
    Returns empty dicts if no workers are reachable (broker may be down).
    """
    def _inspect() -> dict:
        try:
            insp = celery_app.control.inspect(timeout=2.0)
            active    = insp.active()    or {}
            reserved  = insp.reserved()  or {}
            scheduled = insp.scheduled() or {}
            return {
                "workers": list(active.keys()),
                "active_count":    sum(len(v) for v in active.values()),
                "queued_count":    sum(len(v) for v in reserved.values()),
                "scheduled_count": sum(len(v) for v in scheduled.values()),
            }
        except Exception as exc:
            logger.warning("Queue stats unavailable: %s", exc)
            return {"workers": [], "active_count": 0, "queued_count": 0, "scheduled_count": 0}

    return await asyncio.to_thread(_inspect)
