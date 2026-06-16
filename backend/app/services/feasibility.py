import asyncio
import json
import logging
import re

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

# genai is configured lazily inside run_feasibility_check so that import
# does not fail when GEMINI_API_KEY is not yet set (e.g. during tests).


# ── Tool stubs (replace with real API calls in production) ───────────────────

def check_ofac_sanctions(entity_name: str, country: str = "") -> dict:
    """Check entity against OFAC SDN list."""
    return {"match": False, "detail": f"No SDN match found for {entity_name}"}


def check_geopolitical_risk(country: str) -> dict:
    """Get current geopolitical risk level for a country."""
    risk_map = {
        "Russia": "high", "Iran": "very_high", "North Korea": "very_high",
        "Germany": "low", "UAE": "medium", "India": "low",
        "US": "low", "UK": "low", "Singapore": "low",
    }
    return {"risk_level": risk_map.get(country, "medium")}


def get_regulatory_requirements(country: str, industry: str = "") -> dict:
    """Get applicable regulations for a deployment region and industry."""
    reg_map = {
        "Germany": ["GDPR"], "France": ["GDPR"], "India": ["DPDP Act"],
        "UAE": ["UAE PDPL", "MAS TRM"], "US": ["CCPA", "HIPAA"], "UK": ["UK GDPR"],
    }
    return {"regulations": reg_map.get(country, [])}


def web_search(query: str) -> dict:
    """Search for recent regulatory or sanctions news."""
    return {"results": [f"No recent news found for: {query}"]}


_TOOL_FNS = {
    "check_ofac_sanctions":       check_ofac_sanctions,
    "check_geopolitical_risk":    check_geopolitical_risk,
    "get_regulatory_requirements": get_regulatory_requirements,
    "web_search":                 web_search,
}

FEASIBILITY_PROMPT = """Conduct a complete feasibility assessment for this project.

Client: {client_name}
Country: {country}
Industry: {industry}
Description: {description}

Use your available tools to run all four checks:
1. Sanctions screening (OFAC / UN / EU)
2. Geopolitical risk
3. Regulatory mapping
4. Web search for recent news

Return a JSON object with:
  - overall_status: "green" | "amber" | "red"
  - sanctions:    {{status, detail, is_hard_blocker}}
  - geopolitical: {{status, detail, risk_level}}
  - regulatory:   {{status, detail, required_compliances: []}}
  - web_search:   {{status, detail, findings: []}}
  - injected_nfrs: [{{section: "non_functional_requirements", content: "..."}}]
  - hard_blockers: [{{type, detail, override_required}}]

Return ONLY the JSON object. No markdown."""


async def run_feasibility_check(
    client_name: str, country: str, industry: str, description: str
) -> dict:
    def _run_sync() -> dict:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            "gemini-1.5-pro",
            tools=[check_ofac_sanctions, check_geopolitical_risk,
                   get_regulatory_requirements, web_search],
        )
        prompt = FEASIBILITY_PROMPT.format(
            client_name=client_name, country=country,
            industry=industry, description=description,
        )
        response = model.generate_content(prompt)

        # Agentic tool-call loop (max 5 rounds)
        for _ in range(5):
            if not response.candidates:
                break
            if response.candidates[0].finish_reason.name == "STOP":
                break

            tool_parts = []
            has_calls = False
            for part in response.parts:
                fn_call = getattr(part, "function_call", None)
                if fn_call and fn_call.name:
                    has_calls = True
                    fn = _TOOL_FNS.get(fn_call.name, lambda **kw: {})
                    result = fn(**dict(fn_call.args))
                    tool_parts.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=fn_call.name,
                                response={"result": result},
                            )
                        )
                    )
            if not has_calls:
                break

            response = model.generate_content([
                prompt,
                response.candidates[0].content,
                genai.protos.Content(role="function", parts=tool_parts),
            ])

        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Feasibility JSON parse failed; returning amber default")
            return {
                "overall_status": "amber",
                "sanctions":     {"status": "unknown", "detail": "Parse error", "is_hard_blocker": False},
                "geopolitical":  {"status": "unknown", "detail": "Parse error", "risk_level": "medium"},
                "regulatory":    {"status": "unknown", "detail": "Parse error", "required_compliances": []},
                "web_search":    {"status": "unknown", "detail": "Parse error", "findings": []},
                "injected_nfrs": [],
                "hard_blockers": [],
            }

    return await asyncio.to_thread(_run_sync)
