import json
import logging

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-pro")

PRD_SECTIONS = [
    "project_overview", "business_objectives", "stakeholders_personas",
    "scope", "functional_requirements", "non_functional_requirements",
    "user_stories", "technical_constraints", "data_requirements",
    "timeline_milestones", "assumptions_dependencies",
    "open_questions", "glossary", "source_index",
]

PRD_PROMPT = """You are writing the "{section}" section of a Product Requirements Document.

Requirements for this section (with source citations):
{requirements}

Rules:
1. Every requirement must include its source citation in the format: [Source: filename → MM:SS]
2. Write in clear, unambiguous BA language
3. Return a JSON object: {{"content": "...", "completeness": 0.0–1.0}}
   where completeness reflects how complete this section is given the available inputs
4. No markdown, no explanation outside the JSON object"""

GAP_PROMPT = """Review this PRD draft and identify missing or under-specified sections.

PRD content: {prd_json}

Return a JSON array of clarification questions, each with:
  - section: which PRD section it addresses
  - question: the clarification question for the client
  - priority: "high" | "medium" | "low"

Return ONLY the JSON array."""


async def generate_section(section: str, requirements: list[dict]) -> dict:
    req_text = "\n".join(
        f"- {r['content']} [Source: {r['source_refs']['file']} → {r['source_refs']['timestamp']}]"
        for r in requirements
    )
    try:
        response = model.generate_content(
            PRD_PROMPT.format(section=section.replace("_", " ").title(), requirements=req_text)
        )
        return json.loads(response.text)
    except Exception as exc:
        logger.warning("Section %s generation failed: %s", section, exc)
        return {"content": "", "completeness": 0.0}


async def generate_prd(project_id: int, requirements: list[dict]) -> dict:
    prd: dict = {}
    for section in PRD_SECTIONS:
        section_reqs = [r for r in requirements if r["section"] == section]
        prd[section] = (
            await generate_section(section, section_reqs)
            if section_reqs
            else {"content": "", "completeness": 0.0}
        )
    return prd


async def analyse_gaps(prd: dict) -> list[dict]:
    try:
        response = model.generate_content(
            GAP_PROMPT.format(prd_json=json.dumps(prd, indent=2))
        )
        return json.loads(response.text)
    except Exception as exc:
        logger.warning("Gap analysis failed: %s", exc)
        return []
