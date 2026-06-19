"""Synchronous DB helpers for legacy Celery workers.

NOTE: The active processing path (backend/app/workers/tasks.py) does not use
these helpers — it calls process_source_file() directly. This module is kept
for reference and for any tooling that imports it, but is no longer called by
the main task dispatch path.

All PKs are plain integers (SourceFile.id, Project.id, etc.).
Source-file provenance is stored as JSON in Requirement.source_refs, not in a
separate RequirementSource table (which was removed in v3.0).
"""
import asyncio

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.prd_version import PRDVersion
from app.models.requirement import Requirement
from app.models.source_file import SourceFile

_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
_Session = async_sessionmaker(_engine, expire_on_commit=False)


# ── internal async helpers ────────────────────────────────────────────────────

async def _update_source_file(source_file_id: int, **kwargs) -> None:
    async with _Session() as session:
        await session.execute(
            update(SourceFile)
            .where(SourceFile.id == source_file_id)
            .values(**kwargs)
        )
        await session.commit()


async def _get_source_file(source_file_id: int) -> SourceFile | None:
    async with _Session() as session:
        result = await session.execute(
            select(SourceFile).where(SourceFile.id == source_file_id)
        )
        return result.scalar_one_or_none()


async def _get_transcript(source_file_id: int) -> str:
    sf = await _get_source_file(source_file_id)
    return sf.transcript or "" if sf else ""


async def _save_requirements(requirements: list[dict], source_file_id: int) -> None:
    """Persist extracted requirements, embedding source provenance in source_refs."""
    async with _Session() as session:
        sf_result = await session.execute(
            select(SourceFile).where(SourceFile.id == source_file_id)
        )
        sf = sf_result.scalar_one_or_none()
        project_id = sf.project_id if sf else None

        for data in requirements:
            data = dict(data)
            location = data.pop("location", None)
            data.pop("source_ref", None)

            source_refs = data.pop("source_refs", None) or {}
            if location:
                source_refs["location"] = location
            source_refs["source_file_id"] = source_file_id

            req = Requirement(project_id=project_id, source_refs=source_refs, **data)
            session.add(req)

        await session.commit()


async def _get_all_requirements(project_id: int) -> list[Requirement]:
    async with _Session() as session:
        result = await session.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        )
        return result.scalars().all()


async def _save_prd_version(project_id: int, content: dict) -> None:
    async with _Session() as session:
        result = await session.execute(
            select(func.max(PRDVersion.version)).where(
                PRDVersion.project_id == project_id
            )
        )
        next_version = (result.scalar() or 0) + 1
        session.add(
            PRDVersion(
                project_id=project_id,
                version=next_version,
                content=content,
            )
        )
        await session.commit()


# ── public sync API ───────────────────────────────────────────────────────────

def update_source_file(source_file_id: int, **kwargs) -> None:
    asyncio.run(_update_source_file(source_file_id, **kwargs))


def get_source_file(source_file_id: int) -> SourceFile | None:
    return asyncio.run(_get_source_file(source_file_id))


def get_transcript(source_file_id: int) -> str:
    return asyncio.run(_get_transcript(source_file_id))


def save_requirements(requirements: list[dict], source_file_id: int) -> None:
    asyncio.run(_save_requirements(requirements, source_file_id))


def get_all_requirements(project_id: int) -> list[Requirement]:
    return asyncio.run(_get_all_requirements(project_id))


def save_prd_version(project_id: int, content: dict) -> None:
    asyncio.run(_save_prd_version(project_id, content))
