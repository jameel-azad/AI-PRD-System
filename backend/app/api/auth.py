from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.api.deps import get_current_user, require_admin
from app.models.approval import Approval
from app.models.comment import Comment
from app.models.prd_version import PRDVersion
from app.models.project import Project
from app.models.user import User, UserRole

router = APIRouter()


class RegisterBody(BaseModel):
    email: str
    name: str
    password: str
    role: str = "ba_pm"


class LoginBody(BaseModel):
    email: str
    password: str


def _user_out(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


@router.post("/register", status_code=201)
async def register(body: RegisterBody, db: AsyncSession = Depends(get_db)):
    if not settings.REGISTRATION_OPEN:
        raise HTTPException(403, "Self-registration is disabled. Contact your workspace administrator to receive an invitation.")
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Email already registered")
    # Admin accounts cannot be created via public registration
    if body.role == "admin":
        raise HTTPException(403, "Admin accounts cannot be self-registered. Contact your system administrator.")
    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(400, f"Invalid role '{body.role}'. Must be one of: {[r.value for r in UserRole]}")

    user = User(email=body.email, name=body.name, role=role, hashed_pw=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


@router.post("/login")
async def login(body: LoginBody, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


@router.get("/users")
async def list_users(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(User).order_by(User.created_at))).scalars().all()
    return [_user_out(u) for u in rows]


@router.post("/users", status_code=201)
async def admin_create_user(
    body: RegisterBody,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Email already registered")
    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(400, f"Invalid role '{body.role}'")
    user = User(email=body.email, name=body.name, role=role, hashed_pw=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _user_out(user)


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    body: RegisterBody,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot change your own role")
    try:
        user.role = UserRole(body.role)
    except ValueError:
        raise HTTPException(400, f"Invalid role '{body.role}'")
    await db.commit()
    return _user_out(user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot delete your own account")
    await db.delete(user)
    await db.commit()


@router.get("/audit-log")
async def audit_log(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project_query = select(Project.id, Project.name, Project.created_at)
    if current_user.role.value != "admin":
        project_query = project_query.where(Project.owner_id == current_user.id)
    projects = (await db.execute(project_query)).all()

    if not projects:
        return []

    project_ids = [p.id for p in projects]
    project_names = {p.id: p.name for p in projects}
    events = []

    for p in projects:
        events.append({"ts": p.created_at, "actor": current_user.name, "action": "CREATE_PROJECT", "detail": p.name})

    comments = (await db.execute(
        select(Comment, User.name.label("uname"))
        .join(User, Comment.user_id == User.id)
        .where(Comment.project_id.in_(project_ids))
    )).all()
    for row in comments:
        c, uname = row
        events.append({"ts": c.created_at, "actor": uname, "action": "COMMENT", "detail": project_names.get(c.project_id, "")})

    approvals = (await db.execute(
        select(Approval, User.name.label("uname"))
        .join(User, Approval.approver_id == User.id)
        .where(Approval.project_id.in_(project_ids))
    )).all()
    for row in approvals:
        a, uname = row
        events.append({"ts": a.created_at, "actor": uname, "action": f"APPROVAL_{a.status.upper()}", "detail": project_names.get(a.project_id, "")})

    prd_versions = (await db.execute(
        select(PRDVersion).where(PRDVersion.project_id.in_(project_ids))
    )).scalars().all()
    for v in prd_versions:
        events.append({"ts": v.created_at, "actor": "system", "action": f"PRD_v{v.version}_GENERATED", "detail": project_names.get(v.project_id, "")})

    events.sort(key=lambda e: e["ts"], reverse=True)
    return [{"ts": e["ts"].isoformat(), "actor": e["actor"], "action": e["action"], "detail": e["detail"]} for e in events[:20]]
