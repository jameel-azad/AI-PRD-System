from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role, require_admin
from app.core.database import get_db
from app.models.comment import Comment
from app.models.feasibility_report import FeasibilityReport
from app.models.project import Project, ProjectStage
from app.models.prd_version import PRDVersion
from app.models.requirement import Requirement
from app.models.source_file import SourceFile
from app.models.user import User, UserRole

router = APIRouter()


async def _latest_completeness(project_id: int, db: AsyncSession) -> int:
    """Return the overall completeness score (0-100) from the latest PRD version, or 0."""
    prd = (
        await db.execute(
            select(PRDVersion)
            .where(PRDVersion.project_id == project_id)
            .order_by(desc(PRDVersion.version))
        )
    ).scalars().first()
    if not prd or not prd.content:
        return 0
    scores = prd.content.get("_scores", {})
    overall = scores.get("overall", 0)
    return round(float(overall) * 100)


class ProjectCreate(BaseModel):
    name: str
    client_org: str


class StageUpdate(BaseModel):
    stage: str


class CommentBody(BaseModel):
    content: str
    parent_id: int | None = None


class GapAnswerBody(BaseModel):
    gap_key: str   # stable identifier for the gap (e.g. "0", "1", or the question text hash)
    answer: str


@router.get("/")
async def list_projects(
    q: Optional[str] = Query(None, description="Filter by project name or client org (case-insensitive substring)"),
    stage: Optional[str] = Query(None, description="Filter by project stage enum value"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).order_by(Project.created_at.desc())
    if current_user.role.value != "admin":
        query = query.where(Project.owner_id == current_user.id)
    if q:
        like = f"%{q}%"
        query = query.where(
            (Project.name.ilike(like)) | (Project.client_org.ilike(like))
        )
    if stage:
        try:
            query = query.where(Project.stage == ProjectStage(stage))
        except ValueError:
            pass  # ignore invalid stage values
    query = query.offset(offset).limit(limit)
    rows = (await db.execute(query)).scalars().all()

    # Bulk-fetch latest feasibility status for all projects in one query
    if rows:
        project_ids = [p.id for p in rows]
        feas_rows = (await db.execute(
            select(FeasibilityReport.project_id, FeasibilityReport.overall_status)
            .where(FeasibilityReport.project_id.in_(project_ids))
            .order_by(FeasibilityReport.project_id, desc(FeasibilityReport.created_at))
        )).all()
        feas_map: dict[int, str] = {}
        for row in feas_rows:
            if row.project_id not in feas_map:
                feas_map[row.project_id] = row.overall_status
    else:
        feas_map = {}

    result = []
    for p in rows:
        completeness = await _latest_completeness(p.id, db)
        result.append({
            "id": p.id, "name": p.name, "client_org": p.client_org,
            "stage": p.stage, "created_at": p.created_at,
            "completeness": completeness,
            "feas_status": feas_map.get(p.id),
        })
    return result


@router.post("/", status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(require_role(UserRole.admin, UserRole.ba_pm)),
    db: AsyncSession = Depends(get_db),
):
    project = Project(name=body.name, client_org=body.client_org, owner_id=current_user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {"id": project.id, "name": project.name, "client_org": project.client_org, "stage": project.stage}


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied")

    files = (await db.execute(select(SourceFile).where(SourceFile.project_id == project_id))).scalars().all()
    req_count = len((await db.execute(select(Requirement).where(Requirement.project_id == project_id))).scalars().all())
    completeness = await _latest_completeness(project_id, db)

    return {
        "id": project.id,
        "name": project.name,
        "client_org": project.client_org,
        "stage": project.stage,
        "owner_id": project.owner_id,
        "created_at": project.created_at,
        "requirement_count": req_count,
        "completeness": completeness,
        "gap_answers": project.gap_answers or {},
        "files": [
            {"id": f.id, "filename": f.filename, "file_type": f.file_type, "status": f.status}
            for f in files
        ],
    }


@router.patch("/{project_id}/stage")
async def update_stage(
    project_id: int,
    body: StageUpdate,
    current_user: User = Depends(require_role(UserRole.admin, UserRole.ba_pm)),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied")
    try:
        project.stage = ProjectStage(body.stage)
    except ValueError:
        raise HTTPException(400, f"Invalid stage '{body.stage}'")
    await db.commit()
    return {"id": project.id, "stage": project.stage}


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    await db.delete(project)
    await db.commit()


@router.get("/{project_id}/comments")
async def list_comments(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(select(Comment).where(Comment.project_id == project_id).order_by(Comment.created_at))
    ).scalars().all()
    return [
        {"id": c.id, "content": c.content, "user_id": c.user_id, "parent_id": c.parent_id, "resolved": c.resolved, "created_at": c.created_at}
        for c in rows
    ]


@router.post("/{project_id}/comments", status_code=201)
async def add_comment(
    project_id: int,
    body: CommentBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    comment = Comment(project_id=project_id, user_id=current_user.id, content=body.content, parent_id=body.parent_id)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "content": comment.content, "user_id": comment.user_id, "parent_id": comment.parent_id, "resolved": comment.resolved, "created_at": comment.created_at}


@router.patch("/{project_id}/gaps/answer")
async def answer_gap(
    project_id: int,
    body: GapAnswerBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied")
    answers = dict(project.gap_answers or {})
    answers[body.gap_key] = body.answer
    project.gap_answers = answers
    await db.commit()
    return {"project_id": project_id, "gap_key": body.gap_key, "answer": body.answer}


@router.patch("/{project_id}/comments/{comment_id}/resolve")
async def resolve_comment(
    project_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, comment_id)
    if not comment or comment.project_id != project_id:
        raise HTTPException(404, "Comment not found")
    comment.resolved = True
    await db.commit()
    return {"id": comment.id, "resolved": comment.resolved}


@router.get("/{project_id}/activity")
async def get_project_activity(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if current_user.role.value != "admin" and project.owner_id != current_user.id:
        raise HTTPException(403, "Access denied")

    events = []

    # Project created
    events.append({
        "type": "project_created",
        "txt": f"Project **{project.name}** created",
        "time": project.created_at.isoformat(),
        "ico": "🗂",
        "c": "accent",
        "cl": "#fff",
    })

    # Source files uploaded
    files = (await db.execute(
        select(SourceFile).where(SourceFile.project_id == project_id)
    )).scalars().all()
    for f in files:
        if f.created_at:
            events.append({
                "type": "file_uploaded",
                "txt": f"File **{f.filename}** uploaded ({f.file_type})",
                "time": f.created_at.isoformat(),
                "ico": "📎",
                "c": "blue-500",
                "cl": "#fff",
            })
        if f.status == "complete" and f.created_at:
            events.append({
                "type": "file_processed",
                "txt": f"File **{f.filename}** processed — requirements extracted",
                "time": f.created_at.isoformat(),
                "ico": "✅",
                "c": "green-600",
                "cl": "#fff",
            })

    # PRD versions generated
    prd_versions = (await db.execute(
        select(PRDVersion).where(PRDVersion.project_id == project_id)
    )).scalars().all()
    for v in prd_versions:
        events.append({
            "type": "prd_generated",
            "txt": f"PRD version {v.version} generated",
            "time": v.created_at.isoformat(),
            "ico": "📄",
            "c": "purple-600",
            "cl": "#fff",
        })

    # Feasibility reports run
    feasibility_reports = (await db.execute(
        select(FeasibilityReport).where(FeasibilityReport.project_id == project_id)
    )).scalars().all()
    for r in feasibility_reports:
        status_label = {"green": "passed", "amber": "flagged", "red": "blocked"}.get(r.overall_status, r.overall_status)
        events.append({
            "type": "feasibility_run",
            "txt": f"Feasibility check {status_label} — {r.overall_status.upper()}",
            "time": r.created_at.isoformat(),
            "ico": "🔍",
            "c": "orange-500",
            "cl": "#fff",
        })

    events.sort(key=lambda e: e["time"], reverse=True)
    return events
