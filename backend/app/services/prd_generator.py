import asyncio
import json
import logging
import re

from langchain_core.messages import HumanMessage

from app.services.llm_factory import get_llm

logger = logging.getLogger(__name__)

# Sections populated mechanically from other pipeline data, never from
# requirement-driven LLM generation. These are excluded from generate_prd's
# main loop and built separately by the caller.
MECHANICAL_SECTIONS = {"open_questions", "source_index"}

# Sections generated from extracted requirements via the LLM.
LLM_SECTIONS = [
    "project_overview", "business_objectives", "stakeholders_personas",
    "scope", "functional_requirements", "non_functional_requirements",
    "user_stories", "technical_constraints", "data_requirements",
    "timeline_milestones", "assumptions_dependencies", "glossary",
]

PRD_SECTIONS = LLM_SECTIONS + list(MECHANICAL_SECTIONS)

MAX_RETRIES = 2

PRD_PROMPT = """You are writing the "{section}" section of a Product Requirements Document.

Requirements for this section (with source citations):
{requirements}

Rules:
1. Every requirement must include its source citation in the format: [Source: filename -> MM:SS]
   for audio/video sources, or [Source: filename -> Page N] for documents. If a requirement has
   multiple sources, list all of them separated by " | ", e.g.
   [Source: call.mp4 -> 14:32 | email.pdf -> Page 2]
2. Write in clear, unambiguous BA language. Do not omit any requirement provided to you, and do
   not invent requirements that were not provided.
3. Return a JSON object with exactly these fields: {{"content": "..."}}
   Do not include a self-assessed completeness score - that is computed separately.
4. Return ONLY the JSON object. No markdown code fences, no explanation outside the JSON."""

GAP_PROMPT = """Review this PRD draft and identify missing or under-specified sections.

PRD content: {prd_json}

Return a JSON array of clarification questions, each with:
  - section: which PRD section it addresses
  - question: the clarification question for the client
  - priority: "high" | "medium" | "low"

If a section already appears complete and well-supported, do not generate a question for it.
Return ONLY the JSON array. No markdown, no explanation."""


def _strip_code_fences(text: str) -> str:
    """Gemini sometimes wraps JSON in ```json ... ``` despite instructions not to."""
    text = text.strip()
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    return match.group(1) if match else text


def _format_source_ref(ref: dict) -> str:
    """Format a single source reference for citation display."""
    if "timestamp" in ref and ref["timestamp"]:
        return f"{ref['file']} -> {ref['timestamp']}"
    if "page" in ref and ref["page"]:
        return f"{ref['file']} -> Page {ref['page']}"
    return ref.get("file", "unknown source")


def _format_requirement_line(req: dict) -> str:
    """
    Format one requirement with ALL of its source citations.
    Expects req['source_refs'] to be a list of dicts, e.g.
    [{"file": "call.mp4", "timestamp": "14:32"}, {"file": "email.pdf", "page": 2}]
    """
    refs = req.get("source_refs", [])
    if not isinstance(refs, list):
        # Defensive: tolerate a single dict for backward compatibility, but log it
        # so callers fix the upstream data shape.
        logger.warning(
            "source_refs for requirement %r is not a list (got %s) - wrap upstream",
            req.get("content", "")[:60],
            type(refs).__name__,
        )
        refs = [refs] if refs else []

    citation = " | ".join(_format_source_ref(r) for r in refs) or "unknown source"
    return f"- {req['content']} [Source: {citation}]"


async def _call_llm_json(prompt: str, context: str):
    """
    Call the configured LLM and parse JSON output, retrying on transient failures or
    malformed JSON. Returns the parsed object, or None if all attempts fail.
    """
    llm = get_llm()
    last_error = None
    for attempt in range(1, MAX_RETRIES + 2):
        try:
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            cleaned = _strip_code_fences(response.content)
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            last_error = exc
            logger.warning(
                "%s: JSON parse failed on attempt %d/%d: %s",
                context, attempt, MAX_RETRIES + 1, exc,
            )
        except Exception as exc:
            last_error = exc
            logger.warning(
                "%s: generation failed on attempt %d/%d: %s",
                context, attempt, MAX_RETRIES + 1, exc,
            )
        if attempt <= MAX_RETRIES:
            await asyncio.sleep(2 ** attempt)  # exponential backoff: 2s, 4s

    logger.error("%s: all %d attempts exhausted, last error: %s", context, MAX_RETRIES + 1, last_error)
    return None


def _validate_citations(content: str, requirements: list[dict]) -> bool:
    """Best-effort check that every requirement's filename appears somewhere
    in the generated content. Does not guarantee correctness, but catches
    the common failure where the model drops a citation entirely."""
    if not requirements:
        return True
    for req in requirements:
        refs = req.get("source_refs", [])
        if not isinstance(refs, list):
            refs = [refs] if refs else []
        if refs and not any(r.get("file", "") in content for r in refs):
            return False
    return True


def _compute_completeness(section: str, requirements: list[dict]) -> float:
    """
    Deterministic completeness score, independent of LLM self-assessment.
    Based on requirement count and average extraction confidence for this
    section, not on the model grading its own output.
    """
    if not requirements:
        return 0.0
    avg_confidence = sum(r.get("confidence", 0.5) for r in requirements) / len(requirements)
    # Diminishing-returns volume signal: 1 requirement alone shouldn't read as
    # "complete," but section coverage saturates rather than growing unbounded.
    volume_factor = min(len(requirements) / 5, 1.0)
    return round(min(avg_confidence * 0.7 + volume_factor * 0.3, 1.0), 2)


async def generate_section(section: str, requirements: list[dict]) -> dict:
    if not requirements:
        return {"content": "", "completeness": 0.0, "requirement_count": 0}

    req_text = "\n".join(_format_requirement_line(r) for r in requirements)
    prompt = PRD_PROMPT.format(section=section.replace("_", " ").title(), requirements=req_text)

    result = await _call_llm_json(prompt, context=f"generate_section[{section}]")

    if result is None or "content" not in result:
        logger.error("Section %s: falling back to empty content after generation failure", section)
        return {"content": "", "completeness": 0.0, "requirement_count": len(requirements)}

    content = result["content"]

    if not _validate_citations(content, requirements):
        logger.warning(
            "Section %s: one or more requirement sources missing from generated citations - flagging for review",
            section,
        )

    return {
        "content": content,
        "completeness": _compute_completeness(section, requirements),
        "requirement_count": len(requirements),
    }


async def generate_prd(project_id: int, requirements: list[dict]) -> dict:
    """
    Generate all LLM-driven sections concurrently. Mechanical sections
    (open_questions, source_index) are intentionally excluded here - the
    caller should populate those from analyse_gaps() output and the
    project's source_files records, respectively.
    """
    logger.info("Generating PRD for project_id=%s with %d requirements", project_id, len(requirements))

    sections_with_reqs = {
        section: [r for r in requirements if r.get("section") == section]
        for section in LLM_SECTIONS
    }

    results = await asyncio.gather(
        *(generate_section(section, reqs) for section, reqs in sections_with_reqs.items())
    )

    prd = dict(zip(sections_with_reqs.keys(), results))

    unmapped = [r for r in requirements if r.get("section") not in LLM_SECTIONS]
    if unmapped:
        logger.warning(
            "project_id=%s: %d requirements had unrecognised section values: %s",
            project_id, len(unmapped),
            {r.get("section") for r in unmapped},
        )

    return prd


async def analyse_gaps(prd: dict) -> list[dict]:
    result = await _call_llm_json(
        GAP_PROMPT.format(prd_json=json.dumps(prd, indent=2)),
        context="analyse_gaps",
    )
    if result is None or not isinstance(result, list):
        logger.error("Gap analysis returned no usable result, defaulting to empty list")
        return []
    return result