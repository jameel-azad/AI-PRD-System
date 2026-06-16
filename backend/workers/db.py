"""Synchronous DB helpers for Celery workers.

Each public function wraps an async SQLAlchemy call with asyncio.run().
NullPool avoids cross-event-loop connection reuse across separate Celery tasks.
"""
import asyncio
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.prd_version import PRDVersion
from app.models.requirement import Requirement
from app.models.requirement_source import RequirementSource
from app.models.source_file import SourceFile

_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
_Session = async_sessionmaker(_engine, expire_on_commit=False)


# ── internal async helpers ────────────────────────────────────────────────────

async def _update_source_file(source_file_id: str, **kwargs) -> None:
    async with _Session() as session:
        await session.execute(
            update(SourceFile)
            .where(SourceFile.id == uuid.UUID(source_file_id))
            .values(**kwargs)
        )
        await session.commit()


async def _get_source_file(source_file_id: str) -> SourceFile | None:
    async with _Session() as session:
        result = await session.execute(
            select(SourceFile).where(SourceFile.id == uuid.UUID(source_file_id))
        )
        return result.scalar_one_or_none()


async def _get_transcript(source_file_id: str) -> str:
    sf = await _get_source_file(source_file_id)
    return sf.transcript or "" if sf else ""


async def _save_requirements(requirements: list[dict], source_file_id: str) -> None:
    """Persist requirements and link each to source_file via requirement_sources."""
    async with _Session() as session:
        # Look up project_id once
        sf_result = await session.execute(
            select(SourceFile).where(SourceFile.id == uuid.UUID(source_file_id))
        )
        sf = sf_result.scalar_one_or_none()
        project_id = sf.project_id if sf else None

        for data in requirements:
            data = dict(data)  # don't mutate caller's list
            location = data.pop("location", None)
            data.pop("source_ref", None)  # extraction metadata, not a DB column
            req = Requirement(project_id=project_id, **data)
            session.add(req)
            await session.flush()  # populate req.id
            session.add(
                RequirementSource(
                    requirement_id=req.id,
                    source_file_id=uuid.UUID(source_file_id),
                    location=location,
                )
            )
        await session.commit()


async def _get_all_requirements(project_id: str) -> list[Requirement]:
    async with _Session() as session:
        result = await session.execute(
            select(Requirement).where(Requirement.project_id == uuid.UUID(project_id))
        )
        return result.scalars().all()


async def _save_prd_version(project_id: str, content_json: dict) -> None:
    async with _Session() as session:
        result = await session.execute(
            select(func.max(PRDVersion.version_number)).where(
                PRDVersion.project_id == uuid.UUID(project_id)
            )
        )
        next_version = (result.scalar() or 0) + 1
        session.add(
            PRDVersion(
                project_id=uuid.UUID(project_id),
                version_number=next_version,
                content_json=content_json,
            )
        )
        await session.commit()


# ── public sync API ───────────────────────────────────────────────────────────

def update_source_file(source_file_id: str, **kwargs) -> None:
    asyncio.run(_update_source_file(source_file_id, **kwargs))


def get_source_file(source_file_id: str) -> SourceFile | None:
    return asyncio.run(_get_source_file(source_file_id))


def get_transcript(source_file_id: str) -> str:
    return asyncio.run(_get_transcript(source_file_id))


def save_requirements(requirements: list[dict], source_file_id: str) -> None:
    asyncio.run(_save_requirements(requirements, source_file_id))


def get_all_requirements(project_id: str) -> list[Requirement]:
    return asyncio.run(_get_all_requirements(project_id))


def save_prd_version(project_id: str, content_json: dict) -> None:
    asyncio.run(_save_prd_version(project_id, content_json))
