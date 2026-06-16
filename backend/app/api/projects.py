from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.comment import Comment
from app.models.project import Project, ProjectStage
from app.models.requirement import Requirement
from app.models.source_file import SourceFile
from app.models.user import User

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    client_org: str


class StageUpdate(BaseModel):
    stage: str


class CommentBody(BaseModel):
    content: str
    parent_id: int | None = None


@router.get("/")
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(Project).order_by(Project.created_at.desc()))).scalars().all()
    return [
        {"id": p.id, "name": p.name, "client_org": p.client_org, "stage": p.stage, "created_at": p.created_at}
        for p in rows
    ]


@router.post("/", status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
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

    files = (await db.execute(select(SourceFile).where(SourceFile.project_id == project_id))).scalars().all()
    req_count = len((await db.execute(select(Requirement).where(Requirement.project_id == project_id))).scalars().all())

    return {
        "id": project.id,
        "name": project.name,
        "client_org": project.client_org,
        "stage": project.stage,
        "owner_id": project.owner_id,
        "created_at": project.created_at,
        "requirement_count": req_count,
        "files": [
            {"id": f.id, "filename": f.filename, "file_type": f.file_type, "status": f.status}
            for f in files
        ],
    }


@router.patch("/{project_id}/stage")
async def update_stage(
    project_id: int,
    body: StageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    try:
        project.stage = ProjectStage(body.stage)
    except ValueError:
        raise HTTPException(400, f"Invalid stage '{body.stage}'")
    await db.commit()
    return {"id": project.id, "stage": project.stage}


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
        {"id": c.id, "content": c.content, "user_id": c.user_id, "parent_id": c.parent_id, "created_at": c.created_at}
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
    return {"id": comment.id, "content": comment.content, "user_id": comment.user_id, "parent_id": comment.parent_id, "created_at": comment.created_at}
