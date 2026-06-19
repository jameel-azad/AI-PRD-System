"""
Export API — download a project's PRD as PDF, DOCX, or Markdown.

GET /api/v1/export/{project_id}?format=pdf|docx|md
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.project import Project
from app.models.prd_version import PRDVersion
from app.models.user import User
from app.services.export import export_prd

router = APIRouter()


@router.get("/{project_id}")
async def download_prd(
    project_id: int,
    format: str = Query("pdf", pattern="^(pdf|docx|md|markdown)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download the latest PRD version for a project.

    - **format**: `pdf` (default), `docx`, or `md`
    """
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied")

    prd = (
        await db.execute(
            select(PRDVersion)
            .where(PRDVersion.project_id == project_id)
            .order_by(desc(PRDVersion.version))
        )
    ).scalars().first()

    if not prd:
        raise HTTPException(404, "No PRD generated yet — upload files and wait for the pipeline to complete")

    try:
        data, content_type, filename = export_prd(prd.content or {}, project.name, format)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))

    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
