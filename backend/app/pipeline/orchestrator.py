from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# NullPool prevents asyncpg connections from being reused across asyncio.run() calls.
# Each Celery task creates a fresh event loop; pooled connections from a prior loop
# have a dead transport and raise AttributeError on reuse.
_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
_Session = async_sessionmaker(_engine, expire_on_commit=False)
from app.models.source_file import SourceFile
from app.models.requirement import Requirement
from app.models.prd_version import PRDVersion
from app.services.transcription import transcribe
from app.services.embeddings import chunk_text, embed_text
from app.services.extraction import extract_requirements
from app.services.prd_generator import generate_prd, analyse_gaps
from app.services.completeness import score_completeness
from app.services.pii import redact_pii


def _find_timestamp(segments: list[dict], full_text: str, char_pos: int) -> float:
    """Estimate recording timestamp for a character position in the transcript."""
    if not segments:
        return 0.0
    cumulative = 0
    for seg in segments:
        cumulative += len(seg["text"])
        if cumulative >= char_pos:
            return seg["start"]
    return segments[-1]["end"] if segments else 0.0


def _fmt_time(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


async def process_source_file(source_file_id: int) -> None:
    async with _Session() as session:
        sf = await session.get(SourceFile, source_file_id)
        if sf is None:
            return

        sf.status = "processing"
        await session.commit()

        # Stage 2: Transcription (audio/video only)
        if sf.file_type in ("audio", "video"):
            result = await transcribe(sf.storage_key)
            transcript_text = redact_pii(result["full_text"])
            segments = result["segments"]
        else:
            transcript_text = sf.transcript or ""
            segments = []

        sf.transcript = transcript_text
        await session.commit()

        # Stage 3 + 4: Chunk → embed → extract requirements
        chunks = chunk_text(transcript_text)
        for i, chunk in enumerate(chunks):
            char_pos = i * (1500 - 200)
            timestamp = _find_timestamp(segments, transcript_text, char_pos)
            source_ref = f"{sf.filename} → {_fmt_time(timestamp)}"

            items = await extract_requirements(chunk, source_ref)
            for item in items:
                embedding = await embed_text(item["content"])
                session.add(Requirement(
                    project_id=sf.project_id,
                    section=item.get("section", "open_questions"),
                    content=item["content"],
                    source_refs={"file": sf.filename, "timestamp": _fmt_time(timestamp)},
                    embedding=embedding,
                    confidence=item.get("confidence", 0.0),
                ))
        await session.commit()

        # Stages 5–8: PRD generation, gap analysis, completeness scoring
        result_rows = (
            await session.execute(
                select(Requirement).where(Requirement.project_id == sf.project_id)
            )
        ).scalars().all()

        req_list = [
            {"section": r.section, "content": r.content, "source_refs": r.source_refs}
            for r in result_rows
        ]

        prd_content = await generate_prd(sf.project_id, req_list)
        gaps = await analyse_gaps(prd_content)
        scores = score_completeness(prd_content)

        prd_content["_gaps"] = gaps
        prd_content["_scores"] = scores

        session.add(PRDVersion(project_id=sf.project_id, content=prd_content))
        sf.status = "complete"
        await session.commit()
