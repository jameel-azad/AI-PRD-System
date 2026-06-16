from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.feasibility_report import FeasibilityReport
from app.models.project import Project, ProjectStage
from app.models.user import User
from app.services.feasibility import run_feasibility_check

router = APIRouter()


class FeasibilityRunBody(BaseModel):
    client_name: str
    country: str
    industry: str
    description: str


@router.post("/{project_id}/run")
async def run_feasibility(
    project_id: int,
    body: FeasibilityRunBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    result = await run_feasibility_check(body.client_name, body.country, body.industry, body.description)

    report = FeasibilityReport(
        project_id=project_id,
        result=result,
        overall_status=result.get("overall_status", "amber"),
    )
    db.add(report)

    # Move to feasibility stage; if red, it stays blocked until admin override
    project.stage = ProjectStage.feasibility
    await db.commit()
    await db.refresh(report)

    return {"id": report.id, "overall_status": report.overall_status, "result": report.result}


@router.get("/{project_id}")
async def get_feasibility(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    report = (
        await db.execute(
            select(FeasibilityReport)
            .where(FeasibilityReport.project_id == project_id)
            .order_by(desc(FeasibilityReport.created_at))
        )
    ).scalars().first()

    if not report:
        raise HTTPException(404, "No feasibility report found — run a check first")

    return {
        "id": report.id,
        "overall_status": report.overall_status,
        "result": report.result,
        "created_at": report.created_at,
    }


@router.post("/{project_id}/override")
async def override_feasibility(
    project_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    project.stage = ProjectStage.gap_review
    await db.commit()
    return {"message": "Feasibility block overridden by admin", "project_id": project_id, "stage": project.stage}
