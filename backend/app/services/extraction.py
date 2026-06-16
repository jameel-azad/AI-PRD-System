import json
import logging
import re

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-pro")

EXTRACTION_PROMPT = """You are a Business Analyst AI. Extract all requirements, constraints, \
and user needs from the text below. For each item return a JSON object with these fields:
  - type: "functional" | "non_functional" | "constraint" | "assumption"
  - content: the requirement statement (one sentence)
  - section: which PRD section it belongs to (e.g. "functional_requirements")
  - confidence: 0.0–1.0

Source reference: {source_ref}

Text chunk:
{chunk}

Return ONLY a JSON array. No markdown, no explanation."""


async def extract_requirements(chunk: str, source_ref: str) -> list[dict]:
    response = model.generate_content(
        EXTRACTION_PROMPT.format(chunk=chunk, source_ref=source_ref)
    )
    raw = response.text.strip()
    raw = re.sub(r"^```(?:json)?\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to parse extraction response for ref %s", source_ref)
        return []
