import logging
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.comment import Comment
from app.models.prd_version import PRDVersion
from app.models.project import Project, ProjectStage
from app.models.requirement import Requirement
from app.models.user import User
from app.services import email as email_service
from app.services.completeness import score_completeness
from app.services.prd_generator import LLM_SECTIONS, analyse_gaps, generate_prd

logger = logging.getLogger(__name__)

_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
_Session = async_sessionmaker(_engine, expire_on_commit=False)

_CONTEXT_TEMPLATE = """\
\n## Clarification context — incorporate these answers into this section where relevant

### Gap answers provided by the BA/client:
{gap_lines}

### Resolved review comments on this section:
{comment_lines}

These answers and comments represent confirmed information that supersedes any ambiguity \
in the original requirements above. If an answer directly resolves a requirement marked \
as needing clarification, update that requirement's treatment accordingly. \
If no gap answers or comments are relevant to this specific section, ignore this block."""


def _build_section_context(gap_lines: str, section_comment_lines: str) -> str:
    if not gap_lines and not section_comment_lines:
        return ""
    return _CONTEXT_TEMPLATE.format(
        gap_lines=gap_lines or "(none)",
        comment_lines=section_comment_lines or "(none)",
    )


async def regenerate_prd_for_project(project_id: int, session_factory=None) -> None:
    """Re-generate the PRD for a project using Requirements already in the DB,
    enriched with gap answers and resolved comments. Saves a new PRDVersion
    (source='regeneration') and transitions the project stage to 'drafted'.

    session_factory is injectable for tests; production callers omit it.
    """
    Session = session_factory or _Session

    # ── Load all context from DB ───────────────────────────────────────────────
    async with Session() as session:
        project = await session.get(Project, project_id)
        if project is None:
            logger.error("regenerate_prd: project %s not found", project_id)
            return

        gap_answers: dict = project.gap_answers or {}
        project_name = project.name
        owner_id = project.owner_id

        # Resolve gap_answer index keys → question text via latest PRD's _gaps list
        latest_prd = (await session.execute(
            select(PRDVersion)
            .where(PRDVersion.project_id == project_id)
            .order_by(PRDVersion.version.desc())
        )).scalars().first()

        gaps_list: list[dict] = []
        if latest_prd:
            gaps_list = (latest_prd.content or {}).get("_gaps", [])
        elif gap_answers:
            logger.warning(
                "regenerate_prd: project %s has gap_answers but no existing PRD — "
                "gap questions cannot be resolved; answers will be omitted",
                project_id,
            )

        # Build gap_lines (same for every section)
        gap_lines_parts: list[str] = []
        for key, answer in gap_answers.items():
            try:
                question = gaps_list[int(key)]["question"]
            except (IndexError, KeyError, ValueError, TypeError):
                logger.warning(
                    "regenerate_prd: gap key %r has no matching question in _gaps, skipping",
                    key,
                )
                continue
            gap_lines_parts.append(f"- Q: {question}\n  A: {answer}")
        gap_lines = "\n".join(gap_lines_parts)

        # Load resolved, section-tagged comments
        comment_rows = (await session.execute(
            select(Comment)
            .where(
                Comment.project_id == project_id,
                Comment.resolved == True,   # noqa: E712
                Comment.section != None,    # noqa: E711
            )
            .order_by(Comment.section, Comment.created_at)
        )).scalars().all()

        # Batch-load user roles for comment attribution
        user_ids = list({c.user_id for c in comment_rows})
        user_role_map: dict[int, str] = {}
        if user_ids:
            user_rows = (await session.execute(
                select(User).where(User.id.in_(user_ids))
            )).scalars().all()
            user_role_map = {u.id: u.role.value for u in user_rows}

        # Group formatted comment lines by section
        comments_by_section: dict[str, list[str]] = defaultdict(list)
        for c in comment_rows:
            role = user_role_map.get(c.user_id, "ba_pm")
            comments_by_section[c.section].append(f"- [{role}] {c.content}")

        # Build per-section context blocks
        section_context: dict[str, str] = {}
        for section in LLM_SECTIONS:
            section_comment_lines = "\n".join(comments_by_section.get(section, []))
            ctx = _build_section_context(gap_lines, section_comment_lines)
            if ctx:
                section_context[section] = ctx

        # Load all Requirements for this project
        req_rows = (await session.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        )).scalars().all()

        requirements = [
            {
                "section": r.section,
                "content": r.content,
                "source_refs": r.source_refs,
                "confidence": r.confidence,
            }
            for r in req_rows
        ]

        # Determine next version number
        max_version = (await session.execute(
            select(func.max(PRDVersion.version)).where(PRDVersion.project_id == project_id)
        )).scalar() or 0
        new_version = max_version + 1

        # Prefetch owner for notification (before long LLM calls)
        owner_email = ""
        owner_name = ""
        try:
            owner = await session.get(User, owner_id)
            if owner:
                owner_email = owner.email
                owner_name = owner.name
        except Exception:
            logger.warning("regenerate_prd: could not load owner for project %s", project_id)

    # ── LLM generation (outside DB session) ───────────────────────────────────
    prd_content = await generate_prd(project_id, requirements, section_context=section_context)
    gaps = await analyse_gaps(prd_content)
    prd_content["_gaps"] = gaps
    prd_content["_scores"] = score_completeness(prd_content)

    # ── Persist new PRDVersion, update project stage ───────────────────────────
    async with Session() as session:
        session.add(PRDVersion(
            project_id=project_id,
            version=new_version,
            source="regeneration",
            content=prd_content,
        ))
        project = await session.get(Project, project_id)
        if project:
            project.stage = ProjectStage.drafted
        await session.commit()

    logger.info(
        "regenerate_prd: project %s — new PRDVersion %s created (source=regeneration)",
        project_id, new_version,
    )

    # ── Fire-and-forget email ──────────────────────────────────────────────────
    gap_count = len(gap_lines_parts)
    comment_count = sum(len(v) for v in comments_by_section.values())
    if owner_email and project_name:
        await email_service.send_prd_regenerated(
            project_name=project_name,
            owner_email=owner_email,
            owner_name=owner_name,
            version=new_version,
            gap_count=gap_count,
            comment_count=comment_count,
            project_id=project_id,
        )
