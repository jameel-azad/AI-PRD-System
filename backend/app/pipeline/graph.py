import logging

from sqlalchemy import select
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


async def transcribe_node(state: PipelineState) -> dict:
    """Transcribe audio/video via Whisper, or pass through existing text."""
    if state["file_type"] in ("audio", "video"):
        result = await transcribe(state["storage_key"])
        transcript = redact_pii(result["full_text"])
        segments = result["segments"]
    else:
        transcript = state.get("existing_transcript") or ""
        segments = []

    # Persist transcript back to the SourceFile row.
    async with _Session() as session:
        sf = await session.get(SourceFile, state["source_file_id"])
        if sf is not None:
            sf.transcript = transcript
            await session.commit()

    return {"transcript": transcript, "_segments": segments}


async def chunk_and_extract(state: PipelineState) -> dict:
    """Chunk transcript → extract requirements + embed → save Requirement rows."""
    transcript = state.get("transcript", "")
    filename = state["filename"]
    project_id = state["project_id"]

    # _segments is an internal key set by transcribe_node; not in TypedDict but
    # LangGraph passes all state keys, so we read it directly.
    segments = state.get("_segments", [])

    chunks = chunk_text(transcript)
    all_requirements = []

    async with _Session() as session:
        for i, chunk in enumerate(chunks):
            char_pos = i * (1500 - 200)
            timestamp = _find_timestamp(segments, transcript, char_pos)
            source_ref = f"{filename} → {_fmt_time(timestamp)}"

            items = await extract_requirements(chunk, source_ref)
            for item in items:
                embedding = await embed_text(item["content"])
                req = Requirement(
                    project_id=project_id,
                    section=item.get("section", "open_questions"),
                    content=item["content"],
                    source_refs={"file": filename, "timestamp": _fmt_time(timestamp)},
                    embedding=embedding,
                    confidence=item.get("confidence", 0.0),
                )
                session.add(req)
                all_requirements.append({
                    "section": item.get("section", "open_questions"),
                    "content": item["content"],
                    "source_refs": [{"file": filename, "timestamp": _fmt_time(timestamp)}],
                    "confidence": item.get("confidence", 0.0),
                })
        await session.commit()

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
        session.add(PRDVersion(project_id=state["project_id"], content=prd_content))
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
