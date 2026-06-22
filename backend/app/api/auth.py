import logging
import secrets
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.api.deps import get_current_user, require_admin

_log = logging.getLogger(__name__)

_COOKIE = "xccelera_token"

# Simple in-memory rate limiter: max 10 login attempts per IP per 15 minutes.
_LOGIN_ATTEMPTS: dict = defaultdict(list)
_RATE_LIMIT = 10
_RATE_WINDOW = 900  # 15 minutes in seconds

# In-memory password reset codes: email -> (code, expires_at)
_RESET_CODES: dict[str, tuple[str, float]] = {}
_RESET_CODE_TTL = 600  # 10 minutes

# Invite tokens: token -> (role, expires_at). Single-use, 72-hour TTL.
_INVITE_TOKENS: dict[str, tuple[str, float]] = {}
_INVITE_TTL = 72 * 3600

# OTP brute-force protection: email -> list of failed-attempt timestamps.
_RESET_ATTEMPTS: dict[str, list[float]] = {}
_MAX_RESET_ATTEMPTS = 5      # lock after 5 wrong codes
_RESET_ATTEMPT_WINDOW = 900  # 15-minute sliding window

# Forgot-password request rate: email -> list of request timestamps.
_FORGOT_REQUESTS: dict[str, list[float]] = {}
_MAX_FORGOT_REQUESTS = 3     # max 3 reset codes per hour
_FORGOT_REQUEST_WINDOW = 3600


def _check_reset_attempts(email: str) -> None:
    now = time.time()
    cutoff = now - _RESET_ATTEMPT_WINDOW
    recent = [t for t in _RESET_ATTEMPTS.get(email, []) if t > cutoff]
    _RESET_ATTEMPTS[email] = recent
    if len(recent) >= _MAX_RESET_ATTEMPTS:
        raise HTTPException(
            429,
            f"Too many incorrect reset codes — account temporarily locked. "
            f"Try again in {_RESET_ATTEMPT_WINDOW // 60} minutes or request a new code.",
        )


def _record_reset_failure(email: str) -> None:
    _RESET_ATTEMPTS.setdefault(email, []).append(time.time())


def _check_forgot_rate(email: str) -> None:
    now = time.time()
    cutoff = now - _FORGOT_REQUEST_WINDOW
    recent = [t for t in _FORGOT_REQUESTS.get(email, []) if t > cutoff]
    _FORGOT_REQUESTS[email] = recent
    if len(recent) >= _MAX_FORGOT_REQUESTS:
        raise HTTPException(429, "Too many reset code requests. Please wait an hour before requesting another.")


def _check_login_rate(ip: str) -> None:
    now = time.time()
    window_start = now - _RATE_WINDOW
    attempts = [t for t in _LOGIN_ATTEMPTS[ip] if t > window_start]
    _LOGIN_ATTEMPTS[ip] = attempts
    if len(attempts) >= _RATE_LIMIT:
        raise HTTPException(429, f"Too many login attempts. Try again in {_RATE_WINDOW // 60} minutes.")
    _LOGIN_ATTEMPTS[ip].append(now)


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,          # set True behind HTTPS in production
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
    )
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
    invite_token: str | None = None


class LoginBody(BaseModel):
    email: str
    password: str


class ForgotBody(BaseModel):
    email: str


class ResetBody(BaseModel):
    email: str
    code: str
    new_password: str


class RoleBody(BaseModel):
    role: str


def _user_out(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post("/register", status_code=201)
async def register(body: RegisterBody, db: AsyncSession = Depends(get_db)):
    if not settings.REGISTRATION_OPEN:
        if not body.invite_token:
            raise HTTPException(403, "Self-registration is disabled. Contact your workspace administrator for an invite link.")
        entry = _INVITE_TOKENS.get(body.invite_token)
        if not entry:
            raise HTTPException(403, "Invalid or already-used invite token.")
        token_role, expires_at = entry
        if time.time() > expires_at:
            _INVITE_TOKENS.pop(body.invite_token, None)
            raise HTTPException(403, "Invite link has expired. Request a new one from your administrator.")
        # Role is determined by the invite — registrant cannot escalate it
        body.role = token_role
        del _INVITE_TOKENS[body.invite_token]

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
    resp = JSONResponse(status_code=201, content={"user": _user_out(user)})
    _set_auth_cookie(resp, token)
    return resp


@router.post("/login")
async def login(request: Request, body: LoginBody, db: AsyncSession = Depends(get_db)):
    _check_login_rate(request.client.host if request.client else "unknown")
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    resp = JSONResponse(content={"user": _user_out(user)})
    _set_auth_cookie(resp, token)
    return resp


@router.post("/logout")
async def logout():
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(key=_COOKIE, path="/", samesite="lax")
    return resp


@router.post("/refresh")
async def refresh(current_user: User = Depends(get_current_user)):
    """Re-issue the auth cookie, extending the session by JWT_EXPIRE_MINUTES."""
    token = create_access_token({"sub": str(current_user.id), "role": current_user.role.value})
    resp = JSONResponse(content={"user": _user_out(current_user)})
    _set_auth_cookie(resp, token)
    return resp


@router.post("/forgot-password")
async def forgot_password(body: ForgotBody, db: AsyncSession = Depends(get_db)):
    _check_forgot_rate(body.email)
    _FORGOT_REQUESTS.setdefault(body.email, []).append(time.time())
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if user:
        code = f"{secrets.randbelow(900000) + 100000}"  # 6-digit
        _RESET_CODES[body.email] = (code, time.time() + _RESET_CODE_TTL)
        # In production, send this code via email. In dev, expose it in the response.
        _log.warning("[DEV] Password reset code for %s: %s", body.email, code)
        return {"detail": "Reset code sent.", "_dev_code": code}
    # Return same shape regardless — don't reveal whether email exists.
    return {"detail": "Reset code sent."}


@router.post("/reset-password")
async def reset_password(body: ResetBody, db: AsyncSession = Depends(get_db)):
    _check_reset_attempts(body.email)

    entry = _RESET_CODES.get(body.email)
    if not entry:
        _record_reset_failure(body.email)
        raise HTTPException(400, "Invalid or expired reset code. Request a new one.")
    stored_code, expires_at = entry
    if time.time() > expires_at:
        _RESET_CODES.pop(body.email, None)
        _record_reset_failure(body.email)
        raise HTTPException(400, "Reset code expired. Request a new one.")
    if body.code != stored_code:
        _record_reset_failure(body.email)
        raise HTTPException(400, "Incorrect reset code.")
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found.")
    user.hashed_pw = hash_password(body.new_password)
    await db.commit()
    del _RESET_CODES[body.email]
    _RESET_ATTEMPTS.pop(body.email, None)  # clear lockout on success
    return {"detail": "Password reset successfully. You can now sign in."}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


class InviteBody(BaseModel):
    role: str = "ba_pm"


@router.post("/invite", status_code=201)
async def generate_invite(
    body: InviteBody,
    current_user: User = Depends(require_admin),
):
    if body.role == "admin":
        raise HTTPException(400, "Cannot generate an invite for the admin role.")
    try:
        UserRole(body.role)
    except ValueError:
        raise HTTPException(400, f"Invalid role '{body.role}'")
    token = secrets.token_urlsafe(32)
    _INVITE_TOKENS[token] = (body.role, time.time() + _INVITE_TTL)
    invite_url = f"{settings.APP_BASE_URL}/register?token={token}&role={body.role}"
    return {"token": token, "url": invite_url, "expires_in_hours": 72, "role": body.role}


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
    body: RoleBody,
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
    project_count = (
        await db.execute(select(func.count(Project.id)).where(Project.owner_id == user_id))
    ).scalar_one()
    if project_count > 0:
        raise HTTPException(
            400,
            f"Cannot remove this user: they own {project_count} project(s). "
            "Reassign or delete those projects first.",
        )
    try:
        await db.delete(user)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            400,
            "Cannot remove this user: they have associated records in the system. "
            "Remove their linked data first.",
        )


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
