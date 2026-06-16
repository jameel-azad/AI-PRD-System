from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.approval import Approval
from app.models.project import Project, ProjectStage
from app.models.prd_version import PRDVersion
from app.models.user import User

router = APIRouter()


class ApproveBody(BaseModel):
    comment: Optional[str] = None


@router.get("/{project_id}")
async def get_prd(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Project, project_id):
        raise HTTPException(404, "Project not found")

    prd = (
        await db.execute(
            select(PRDVersion)
            .where(PRDVersion.project_id == project_id)
            .order_by(desc(PRDVersion.version))
        )
    ).scalars().first()

    if not prd:
        raise HTTPException(404, "No PRD generated yet — upload files and wait for pipeline to complete")

    # Detach metadata before returning content to client
    content = dict(prd.content or {})
    scores = content.pop("_scores", {})
    gaps = content.pop("_gaps", [])

    return {
        "id": prd.id,
        "version": prd.version,
        "project_id": project_id,
        "content": content,
        "scores": scores,
        "gaps": gaps,
        "created_at": prd.created_at,
    }


@router.post("/{project_id}/approve")
async def approve_prd(
    project_id: int,
    body: ApproveBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    approval = Approval(
        project_id=project_id,
        approver_id=current_user.id,
        status="approved",
        comment=body.comment,
    )
    db.add(approval)
    project.stage = ProjectStage.approved
    await db.commit()
    await db.refresh(approval)
    return {"id": approval.id, "status": approval.status, "created_at": approval.created_at}


@router.get("/{project_id}/approvals")
async def get_approvals(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(select(Approval).where(Approval.project_id == project_id).order_by(Approval.created_at))
    ).scalars().all()
    return [
        {"id": a.id, "status": a.status, "comment": a.comment, "approver_id": a.approver_id, "created_at": a.created_at}
        for a in rows
    ]
