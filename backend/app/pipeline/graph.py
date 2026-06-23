import asyncio
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from langgraph.graph import StateGraph, START, END

from app.core.config import settings
from app.pipeline.state import PipelineState
from app.models.source_file import SourceFile
from app.models.requirement import Requirement
from app.models.prd_version import PRDVersion
from app.services.transcription import transcribe
from app.services.embeddings import chunk_text, embed_text
from app.services.extraction import extract_requirements
from app.services.prd_generator import generate_prd, analyse_gaps
from app.services.completeness import score_completeness
from app.services.pii import redact_pii
from app.services import email as email_service
from app.models.user import User

logger = logging.getLogger(__name__)

# NullPool: Celery tasks create a fresh event loop per call; pooled connections
# from a prior loop would have a dead transport.
_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
_Session = async_sessionmaker(_engine, expire_on_commit=False)


def _find_timestamp(segments: list[dict], full_text: str, char_pos: int) -> float:
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


# ── Node implementations ───────────────────────────────────────────────────────

async def load_source_file(state: PipelineState) -> dict:
    """Load SourceFile row from DB and mark it as processing."""
    async with _Session() as session:
        sf = await session.get(SourceFile, state["source_file_id"])
        if sf is None:
            return {"error": f"SourceFile {state['source_file_id']} not found"}
        sf.status = "processing"
        await session.commit()
        return {
            "project_id": sf.project_id,
            "storage_key": sf.storage_key,
            "filename": sf.filename,
            "file_type": sf.file_type,
            "existing_transcript": sf.transcript or None,
            "error": None,
        }


async def _read_document(storage_key: str, filename: str) -> str:
    """Download a document from MinIO and extract its plain text.

    Supported: .txt, .md  (direct UTF-8 read)
               .docx      (python-docx paragraph extraction)
               .pdf       (PyMuPDF if installed, otherwise warns and returns "")
    """
    from app.services.storage import storage_service

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    try:
        raw = await storage_service.download_bytes(storage_key)
    except Exception as exc:
        logger.error("_read_document: failed to download %s: %s", storage_key, exc)
        return ""

    if ext in ("txt", "md"):
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("latin-1", errors="replace")

    if ext == "docx":
        try:
            import io
            from docx import Document
            doc = Document(io.BytesIO(raw))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as exc:
            logger.error("_read_document: DOCX extraction failed for %s: %s", filename, exc)
            return ""

    if ext == "pdf":
        try:
            import io
            import fitz  # PyMuPDF
            doc = fitz.open(stream=raw, filetype="pdf")
            return "\n".join(page.get_text() for page in doc)
        except ImportError:
            logger.warning(
                "_read_document: PDF text extraction requires pymupdf "
                "(pip install pymupdf). Skipping %s", filename
            )
        except Exception as exc:
            logger.error("_read_document: PDF extraction failed for %s: %s", filename, exc)
        return ""

    logger.warning("_read_document: no text extractor for .%s (%s)", ext, filename)
    return ""


async def transcribe_node(state: PipelineState) -> dict:
    """Transcribe audio/video via Whisper; download and read text for documents."""
    if state["file_type"] in ("audio", "video"):
        result = await transcribe(state["storage_key"])
        transcript = redact_pii(result["full_text"])
        segments = result["segments"]
    else:
        segments = []
        # Use cached transcript if this file was already processed (re-run case).
        transcript = state.get("existing_transcript") or ""
        if not transcript:
            # First run: download from MinIO and extract text.
            transcript = await _read_document(state["storage_key"], state["filename"])
            transcript = redact_pii(transcript) if transcript else ""
            if not transcript:
                logger.warning(
                    "transcribe_node: empty transcript for %s (file_type=%s) — "
                    "check that the file was uploaded with content",
                    state["filename"], state["file_type"],
                )

    # Persist transcript back to the SourceFile row so re-runs skip the download.
    async with _Session() as session:
        sf = await session.get(SourceFile, state["source_file_id"])
        if sf is not None:
            sf.transcript = transcript
            await session.commit()

    return {"transcript": transcript, "_segments": segments}


async def chunk_and_extract(state: PipelineState) -> dict:
    """Chunk transcript → extract requirements + embed → save Requirement rows.

    Parallelised in three phases:
      Phase 1 — all chunks extracted concurrently (one LLM call per chunk).
      Phase 2 — all unique items embedded concurrently (one API call per item).
      Phase 3 — dedup + DB save, sequential to avoid race conditions.
    """
    transcript = state.get("transcript", "")
    filename = state["filename"]
    project_id = state["project_id"]
    segments = state.get("_segments", [])

    chunks = chunk_text(transcript)
    if not chunks:
        logger.warning("chunk_and_extract: empty transcript for %s", filename)
        return {"requirements": []}

    # ── Phase 1: extract all chunks concurrently ──────────────────────────────
    async def _extract_chunk(i: int, chunk: str):
        char_pos = i * (1500 - 200)
        timestamp = _find_timestamp(segments, transcript, char_pos)
        source_ref = f"{filename} → {_fmt_time(timestamp)}"
        new_ref = {"file": filename, "timestamp": _fmt_time(timestamp)}
        items = await extract_requirements(chunk, source_ref)
        return [(item, new_ref) for item in items]

    chunk_results = await asyncio.gather(*(_extract_chunk(i, c) for i, c in enumerate(chunks)))
    all_items = [pair for result in chunk_results for pair in result]

    logger.info(
        "chunk_and_extract: %d chunks → %d raw items extracted from %s",
        len(chunks), len(all_items), filename,
    )

    if not all_items:
        return {"requirements": []}

    # Quick in-memory exact dedup before hitting the embedding API
    seen_contents: set[str] = set()
    unique_items = []
    for item, new_ref in all_items:
        key = item["content"].strip().lower()
        if key not in seen_contents:
            seen_contents.add(key)
            unique_items.append((item, new_ref))

    # ── Phase 2: embed all unique items concurrently ──────────────────────────
    async def _embed(item, new_ref):
        embedding = await embed_text(item["content"])
        return (item, new_ref, embedding)

    embedded = await asyncio.gather(*(_embed(item, ref) for item, ref in unique_items))

    # ── Phase 3: dedup against DB and save (sequential) ───────────────────────
    all_requirements = []
    async with _Session() as session:
        for item, new_ref, embedding in embedded:
            content = item["content"]

            # Layer 1: exact-text dedup
            exact_dup = (await session.execute(
                select(Requirement).where(
                    Requirement.project_id == project_id,
                    Requirement.content == content,
                )
            )).scalars().first()
            if exact_dup is not None:
                logger.debug("chunk_and_extract: exact duplicate skipped: %.80s", content)
                continue

            # Layer 2: semantic similarity dedup via pgvector
            near_dup = (await session.execute(
                select(Requirement)
                .where(
                    Requirement.project_id == project_id,
                    Requirement.embedding.cosine_distance(embedding) < 0.08,
                )
                .order_by(Requirement.embedding.cosine_distance(embedding))
                .limit(1)
            )).scalars().first()

            if near_dup is not None:
                existing_refs = near_dup.source_refs
                near_dup.source_refs = (
                    existing_refs + [new_ref]
                    if isinstance(existing_refs, list)
                    else [existing_refs, new_ref]
                )
                logger.debug(
                    "chunk_and_extract: near-duplicate merged into req %s: %.80s",
                    near_dup.id, content,
                )
                continue

            req = Requirement(
                project_id=project_id,
                section=item.get("section", "open_questions"),
                content=content,
                source_refs=[new_ref],
                embedding=embedding,
                confidence=item.get("confidence", 0.0),
            )
            session.add(req)
            all_requirements.append({
                "section": item.get("section", "open_questions"),
                "content": content,
                "source_refs": [new_ref],
                "confidence": item.get("confidence", 0.0),
            })
        await session.commit()

    logger.info(
        "chunk_and_extract: %d unique requirements saved for project %s",
        len(all_requirements), project_id,
    )
    return {"requirements": all_requirements}


async def generate_prd_node(state: PipelineState) -> dict:
    """Generate all PRD sections concurrently from extracted requirements."""
    prd_content = await generate_prd(state["project_id"], state.get("requirements", []))
    return {"prd_content": prd_content}


async def analyse_gaps_node(state: PipelineState) -> dict:
    """Run gap analysis over the generated PRD."""
    gaps = await analyse_gaps(state.get("prd_content", {}))
    return {"gaps": gaps}


async def score_completeness_node(state: PipelineState) -> dict:
    """Compute traffic-light completeness scores for the PRD."""
    scores = score_completeness(state.get("prd_content", {}))
    return {"scores": scores}


async def save_prd(state: PipelineState) -> dict:
    """Merge gaps + scores into PRD content, save PRDVersion, mark SourceFile complete."""
    prd_content = dict(state.get("prd_content", {}))
    gaps = state.get("gaps", [])
    prd_content["_gaps"] = gaps
    prd_content["_scores"] = state.get("scores", {})

    project_name = ""
    owner_email = ""
    owner_name = ""

    async with _Session() as session:
        max_ver = await session.scalar(
            select(func.max(PRDVersion.version)).where(PRDVersion.project_id == state["project_id"])
        )
        next_version = (max_ver or 0) + 1
        session.add(PRDVersion(project_id=state["project_id"], version=next_version, content=prd_content))
        sf = await session.get(SourceFile, state["source_file_id"])
        if sf is not None:
            sf.status = "complete"
        await session.commit()

        # Fetch project + owner for notifications (best-effort — don't fail pipeline)
        try:
            from app.models.project import Project
            project = await session.get(Project, state["project_id"])
            if project:
                project_name = project.name
                owner = await session.get(User, project.owner_id)
                if owner:
                    owner_email = owner.email
                    owner_name = owner.name
        except Exception:
            logger.warning("save_prd: could not load project/owner for email notification")

    # Fire-and-forget email notifications
    if owner_email and project_name:
        await email_service.send_prd_ready(
            project_name, owner_email, owner_name, state["project_id"]
        )
        if gaps:
            await email_service.send_gap_review_needed(
                project_name, owner_email, owner_name, len(gaps), state["project_id"]
            )

    return {}


async def handle_error(state: PipelineState) -> dict:
    """Mark the SourceFile as failed and log the error."""
    error = state.get("error", "unknown error")
    logger.error(
        "Pipeline failed for source_file_id=%s: %s",
        state.get("source_file_id"), error,
    )
    async with _Session() as session:
        sf = await session.get(SourceFile, state.get("source_file_id"))
        if sf is not None:
            sf.status = "failed"
            await session.commit()
    return {}


# ── Graph assembly ─────────────────────────────────────────────────────────────

def _route_after_load(state: PipelineState) -> str:
    return "handle_error" if state.get("error") else "transcribe_node"


builder = StateGraph(PipelineState)

builder.add_node("load_source_file",      load_source_file)
builder.add_node("transcribe_node",       transcribe_node)
builder.add_node("chunk_and_extract",     chunk_and_extract)
builder.add_node("generate_prd_node",     generate_prd_node)
builder.add_node("analyse_gaps_node",     analyse_gaps_node)
builder.add_node("score_completeness_node", score_completeness_node)
builder.add_node("save_prd",              save_prd)
builder.add_node("handle_error",          handle_error)

builder.add_edge(START, "load_source_file")
builder.add_conditional_edges("load_source_file", _route_after_load)
builder.add_edge("transcribe_node",       "chunk_and_extract")
builder.add_edge("chunk_and_extract",     "generate_prd_node")
builder.add_edge("generate_prd_node",     "analyse_gaps_node")
builder.add_edge("analyse_gaps_node",     "score_completeness_node")
builder.add_edge("score_completeness_node", "save_prd")
builder.add_edge("save_prd",              END)
builder.add_edge("handle_error",          END)

pipeline_graph = builder.compile()
