import json
import logging
import re

from langchain_core.messages import HumanMessage

from app.services.llm_factory import get_llm

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are a senior Business Analyst AI specializing in requirements \
extraction from raw client communication (call transcripts, emails, documents, chat logs).

Your job: read the text chunk below and extract every distinct requirement, constraint, \
assumption, or stakeholder/timeline mention. You must be precise, conservative, and grounded \
strictly in what the text says — never infer requirements the client did not actually express.

## Categories

Classify each extracted item into exactly one of these types:
  - "functional": something the system/product must DO (a feature, action, or behavior)
  - "non_functional": a quality attribute (performance, security, scalability, availability,
    usability, compliance) rather than a feature
  - "constraint": a limitation imposed on the solution (budget, technology, timeline, legal,
    vendor, platform restriction)
  - "assumption": something the client implied or stated as a given, not yet confirmed as fact
  - "stakeholder": a person, role, or team mentioned as involved in or affected by the project
  - "timeline": a date, deadline, milestone, or duration mentioned

## PRD section mapping

Map every item to exactly one of these section keys:
  "project_overview" | "business_objectives" | "stakeholders" | "scope" |
  "functional_requirements" | "non_functional_requirements" | "user_stories" |
  "technical_constraints" | "data_requirements" | "timeline_milestones" |
  "assumptions_dependencies" | "glossary"

## Required fields per extracted item

Return each item as a JSON object with exactly these fields:

  - "type": one of the categories above
  - "content": the requirement rewritten as a single, clear, formal sentence using
    "The system shall..." phrasing for functional/non_functional items. Do NOT copy the
    client's casual phrasing verbatim — normalize it into formal requirement language while
    preserving the original meaning exactly. Do not add scope, numbers, or specifics the
    client did not state.
  - "section": the PRD section key from the list above
  - "confidence": a float 0.0–1.0 reflecting how explicitly and unambiguously this was stated
      * 0.9–1.0: client stated this directly and unambiguously
      * 0.6–0.89: client implied this strongly but did not state it with full specificity
      * 0.3–0.59: this is a weak inference from context; flag for human review
      * Below 0.3: do not include the item at all — discard it
  - "evidence_quote": the exact short phrase (max 25 words) from the source text that most
    directly supports this extraction. This is used for citation grounding — it must be a
    verbatim substring of the input text, not paraphrased.
  - "source_ref": always set this to the literal string "{source_ref}" (passed in below) —
    copy it unchanged into every item.
  - "needs_clarification": boolean — true if this item is vague, conflicting, or missing
    critical detail (e.g. "the system should be fast" with no benchmark). When true, also
    include a "clarification_question" field with a specific, answerable follow-up question.

## Rules — read carefully

1. **Never invent requirements.** If the text doesn't clearly support an item, do not include
   it. It is far better to under-extract than to hallucinate a requirement that sounds
   plausible but wasn't actually said.
2. **One requirement per object.** If a sentence contains two distinct requirements
   ("it should support login via email and via Google SSO"), split them into two separate
   JSON objects, not one combined sentence.
3. **Deduplicate within this chunk only.** If the same requirement is restated twice in this
   same chunk, return it once. (Cross-chunk deduplication happens later in the pipeline —
   you do not need to worry about other chunks.)
4. **Preserve negatives and exclusions.** "We do NOT need multi-currency support" is a real
   constraint/scope item — extract it, do not discard it just because it's negative.
5. **Vague filler is not a requirement.** Statements like "let's make it good" or "it should
   be modern" with zero concrete substance should be discarded, not extracted as
   low-confidence items.
6. **Numbers and specifics must be exact.** If the client says "under 2 seconds" or "500
   concurrent users," reproduce that number exactly in "content" — do not round, estimate, or
   generalize it.
7. **Don't merge speaker attribution into content.** If the transcript shows multiple
   speakers, extract the requirement itself, not "Speaker 2 said that...".
8. **If the chunk contains no extractable items**, return an empty JSON array: []. This is a
   valid and expected output for chunks that are pure small talk, scheduling, or greetings.

## Output format

Return ONLY a raw JSON array of objects. No markdown code fences, no backticks, no
explanation, no preamble, no trailing commentary — your entire response must be valid JSON
that can be parsed directly with json.loads().

## Example

Input text: "Okay so for payments, we definitely need UPI and credit cards. Cash on delivery
is a maybe, need to check with finance. Oh and the app absolutely cannot store card numbers
ourselves — that's a compliance thing our legal team flagged."

Expected output:
[
  {{
    "type": "functional",
    "content": "The system shall support UPI as a payment method.",
    "section": "functional_requirements",
    "confidence": 0.95,
    "evidence_quote": "we definitely need UPI and credit cards",
    "source_ref": "{source_ref}",
    "needs_clarification": false
  }},
  {{
    "type": "functional",
    "content": "The system shall support credit card payments.",
    "section": "functional_requirements",
    "confidence": 0.95,
    "evidence_quote": "we definitely need UPI and credit cards",
    "source_ref": "{source_ref}",
    "needs_clarification": false
  }},
  {{
    "type": "assumption",
    "content": "Cash on delivery as a payment method is under consideration, pending finance team confirmation.",
    "section": "assumptions_dependencies",
    "confidence": 0.5,
    "evidence_quote": "Cash on delivery is a maybe, need to check with finance",
    "source_ref": "{source_ref}",
    "needs_clarification": true,
    "clarification_question": "Will cash on delivery be included as a supported payment method? Finance team confirmation was pending."
  }},
  {{
    "type": "constraint",
    "content": "The system shall not store raw credit card numbers, per legal/compliance requirements.",
    "section": "non_functional_requirements",
    "confidence": 0.95,
    "evidence_quote": "the app absolutely cannot store card numbers ourselves",
    "source_ref": "{source_ref}",
    "needs_clarification": false
  }}
]

## Now process this chunk

Source reference: {source_ref}

Text chunk:
{chunk}

Return ONLY the JSON array."""


async def extract_requirements(chunk: str, source_ref: str) -> list[dict]:
    llm = get_llm()
    response = await llm.ainvoke(
        [HumanMessage(content=EXTRACTION_PROMPT.format(chunk=chunk, source_ref=source_ref))]
    )
    raw = response.content.strip()
    raw = re.sub(r"^```(?:json)?\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to parse extraction response for ref %s", source_ref)
        return []
