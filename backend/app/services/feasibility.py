import json
import logging
import re

import httpx
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from app.core.config import settings
from app.services.llm_factory import get_llm

logger = logging.getLogger(__name__)


# ── Sanctions / risk data (static reference — Gemini is prompted to treat these
#    as unverified training-data snapshots and MUST call web_search to confirm
#    current status before raising any flag.) ──────────────────────────────────

# Countries subject to US comprehensive or sectoral sanctions (OFAC).
# Source: OFAC country-specific information pages (training-data snapshot).
_OFAC_COMPREHENSIVE = {
    "Cuba", "Iran", "North Korea", "Russia", "Syria", "Venezuela",
}
_OFAC_SECTORAL = {
    "Belarus": "sectoral — financial/energy/defense sectors",
    "Ukraine (Crimea)": "comprehensive in occupied territories",
    "Myanmar": "targeted — military entities",
    "Zimbabwe": "targeted — named individuals",
    "Sudan": "limited — Darfur-related",
}

# Countries listed by the UN Security Council Consolidated Sanctions List.
_UN_SANCTIONS = {
    "North Korea", "Iran", "Libya", "Mali", "Central African Republic",
    "Democratic Republic of the Congo", "Guinea-Bissau", "Haiti",
    "Iraq", "Lebanon", "Somalia", "South Sudan", "Sudan", "Yemen",
}

# EU CFSP consolidated list — countries with broad measures.
_EU_SANCTIONS = {
    "Russia", "Belarus", "Iran", "North Korea", "Syria", "Myanmar",
    "Venezuela", "Cuba", "Nicaragua", "Zimbabwe",
    "Mali", "Sudan", "South Sudan", "Libya", "Yemen", "Central African Republic",
}

# UK OFSI — broad country-level measures.
_UK_OFSI = {
    "Russia", "Belarus", "Iran", "North Korea", "Syria", "Myanmar",
    "Venezuela", "Zimbabwe", "Mali", "Sudan", "Libya",
}

# Geopolitical risk levels.  "very_high" = RED trigger. "high" = AMBER trigger.
_GEO_RISK: dict[str, str] = {
    # very_high — active comprehensive sanctions + severe instability
    "North Korea": "very_high",
    "Iran": "very_high",
    "Syria": "very_high",
    "Cuba": "very_high",
    "Venezuela": "very_high",
    # high — significant sanctions or active conflict
    "Russia": "high",
    "Belarus": "high",
    "Myanmar": "high",
    "Libya": "high",
    "Yemen": "high",
    "Sudan": "high",
    "South Sudan": "high",
    "Mali": "high",
    "Somalia": "high",
    "Haiti": "high",
    "Afghanistan": "high",
    "Iraq": "high",
    "Ethiopia": "high",
    "Nicaragua": "high",
    "Zimbabwe": "high",
    # medium — moderate political risk, data residency laws, or trade friction
    "China": "medium",
    "Pakistan": "medium",
    "Nigeria": "medium",
    "Egypt": "medium",
    "Turkey": "medium",
    "Saudi Arabia": "medium",
    "UAE": "medium",
    "Indonesia": "medium",
    "Vietnam": "medium",
    "Bangladesh": "medium",
    "Kazakhstan": "medium",
    "Azerbaijan": "medium",
    "Serbia": "medium",
    "Algeria": "medium",
    "Lebanon": "medium",
    # low — stable governance, no active sanctions
    "United States": "low", "US": "low",
    "United Kingdom": "low", "UK": "low",
    "Germany": "low",
    "France": "low",
    "Netherlands": "low",
    "Sweden": "low",
    "Norway": "low",
    "Denmark": "low",
    "Finland": "low",
    "Switzerland": "low",
    "Austria": "low",
    "Belgium": "low",
    "Ireland": "low",
    "Portugal": "low",
    "Spain": "low",
    "Italy": "low",
    "Poland": "low",
    "Czech Republic": "low",
    "Hungary": "low",
    "Greece": "low",
    "Romania": "low",
    "Canada": "low",
    "Australia": "low",
    "New Zealand": "low",
    "Japan": "low",
    "South Korea": "low",
    "Singapore": "low",
    "Israel": "low",
    "India": "low",
    "Brazil": "low",
    "Mexico": "low",
    "South Africa": "low",
    "Kenya": "low",
    "Ghana": "low",
    "Colombia": "low",
    "Chile": "low",
    "Argentina": "low",
    "Peru": "low",
    "Thailand": "low",
    "Malaysia": "low",
    "Philippines": "low",
    "Taiwan": "low",
    "Hong Kong": "low",
}

# Data sovereignty / residency notes per country.
_DATA_SOVEREIGNTY: dict[str, str] = {
    "Russia": "Federal Law No. 242-FZ requires personal data of Russian citizens to be stored on servers within Russia.",
    "China": "PIPL and DSL require data localisation for 'important data' and personal data; cross-border transfers need a security assessment.",
    "India": "DPDP Act 2023 restricts cross-border transfers of personal data to notified countries only.",
    "Saudi Arabia": "PDPL requires personal data to be stored within Saudi Arabia unless approved transfer conditions are met.",
    "Indonesia": "Government Regulation 71/2019 requires strategic electronic data to be localised; health and financial data must stay onshore.",
    "Vietnam": "Cybersecurity Law (2018) mandates local storage of user data collected in Vietnam.",
    "Turkey": "KVKK requires explicit consent for cross-border data transfers.",
    "UAE": "DIFC Data Protection Law and ADGM DPDL apply in free zones; mainland UAE PDPL (2022) restricts offshore transfers.",
    "Nigeria": "NDPA (2023) restricts personal data transfers outside Nigeria without adequate protection.",
    "Germany": "GDPR applies; Schrems II requires standard contractual clauses or adequacy decision for non-EEA transfers.",
    "France": "GDPR applies; CNIL actively enforces.",
    "Brazil": "LGPD restricts international data transfers to countries with adequate protection or via approved mechanisms.",
    "South Korea": "PIPA requires consent for cross-border personal data transfers.",
    "Japan": "APPI (amended 2022) restricts transfers to countries without equivalent protection.",
}

# Regulatory frameworks by country (data protection) and by industry.
_COUNTRY_REGS: dict[str, list[str]] = {
    # EU/EEA — GDPR
    "Germany": ["GDPR"], "France": ["GDPR"], "Netherlands": ["GDPR"],
    "Sweden": ["GDPR"], "Norway": ["GDPR"], "Denmark": ["GDPR"],
    "Finland": ["GDPR"], "Austria": ["GDPR"], "Belgium": ["GDPR"],
    "Ireland": ["GDPR"], "Portugal": ["GDPR"], "Spain": ["GDPR"],
    "Italy": ["GDPR"], "Poland": ["GDPR"], "Czech Republic": ["GDPR"],
    "Hungary": ["GDPR"], "Greece": ["GDPR"], "Romania": ["GDPR"],
    "Switzerland": ["Swiss nFADP (aligned with GDPR)"],
    # UK post-Brexit
    "United Kingdom": ["UK GDPR", "Data Protection Act 2018"], "UK": ["UK GDPR", "Data Protection Act 2018"],
    # Americas
    "United States": ["CCPA/CPRA (California)", "HIPAA (if healthcare)", "FedRAMP (if US government)"],
    "US": ["CCPA/CPRA (California)", "HIPAA (if healthcare)", "FedRAMP (if US government)"],
    "Brazil": ["LGPD"],
    "Canada": ["PIPEDA / Bill C-27 (pending)"],
    # APAC
    "India": ["DPDP Act 2023"],
    "Singapore": ["PDPA 2012 (amended 2020)"],
    "Thailand": ["PDPA 2019"],
    "Japan": ["APPI (amended 2022)"],
    "South Korea": ["PIPA"],
    "Australia": ["Privacy Act 1988 (amended 2022)"],
    "China": ["PIPL", "DSL", "Cybersecurity Law"],
    "Vietnam": ["Cybersecurity Law 2018", "Decree 13/2023"],
    "Indonesia": ["PDP Law 2022"],
    "Malaysia": ["PDPA 2010"],
    "Philippines": ["Data Privacy Act 2012"],
    # Middle East / Africa
    "UAE": ["UAE PDPL 2021 (Federal Law No. 45)", "DIFC DPL (if DIFC entity)", "ADGM DPDL (if ADGM entity)"],
    "Saudi Arabia": ["PDPL 2021"],
    "Turkey": ["KVKK (Law No. 6698)"],
    "South Africa": ["POPIA"],
    "Nigeria": ["NDPA 2023"],
    "Kenya": ["Data Protection Act 2019"],
    "Ghana": ["Data Protection Act 2012"],
}

_INDUSTRY_REGS: dict[str, list[str]] = {
    "healthcare":    ["HIPAA (if US patients/data)", "ISO 13485 (if medical devices)", "local health-data law"],
    "health":        ["HIPAA (if US patients/data)", "local health-data law"],
    "fintech":       ["PCI-DSS", "local financial services regulator", "AML/KYC framework"],
    "finance":       ["PCI-DSS", "local financial services regulator", "AML/KYC framework"],
    "banking":       ["PCI-DSS", "Basel III/IV (if banking)", "local financial services regulator"],
    "insurance":     ["local insurance regulator", "Solvency II (if EU)"],
    "government":    ["FedRAMP (if US federal)", "OFFICIAL-SENSITIVE (if UK government)", "ISO 27001"],
    "defense":       ["ITAR", "EAR", "CMMC (if US DoD contracts)", "ISO 27001"],
    "education":     ["FERPA (if US)", "local student-data law"],
    "retail":        ["PCI-DSS (if card payments)", "CCPA/GDPR (consumer data)"],
    "e-commerce":    ["PCI-DSS", "CCPA/GDPR (consumer data)", "Distance Selling Regulations"],
    "saas":          ["SOC 2 Type II", "ISO 27001"],
    "cloud":         ["SOC 2 Type II", "ISO 27001", "CSA STAR"],
    "telecommunications": ["local telecom regulator", "lawful interception requirements"],
    "energy":        ["local energy regulator", "NERC CIP (if US critical infrastructure)"],
    "pharmaceutical": ["GxP", "21 CFR Part 11 (if US FDA)", "EU Annex 11"],
}


@tool
def check_ofac_sanctions(entity_name: str, country: str = "") -> dict:
    """
    Check entity name and country against the four major sanctions lists.

    Returns a structured finding with match status per list and whether any
    match constitutes a hard blocker.  This is a static snapshot — the Gemini
    agent is instructed to call web_search to verify current status.
    """
    entity_lower = entity_name.lower()
    country_norm = country.strip()

    findings: list[str] = []
    hard_blocker = False

    # OFAC
    if country_norm in _OFAC_COMPREHENSIVE:
        findings.append(f"OFAC: {country_norm} is subject to a comprehensive US sanctions programme.")
        hard_blocker = True
    elif country_norm in _OFAC_SECTORAL:
        findings.append(f"OFAC: {country_norm} has sectoral sanctions — {_OFAC_SECTORAL[country_norm]}.")
    else:
        findings.append(f"OFAC: {country_norm or entity_name} not found on comprehensive SDN/country list in static snapshot.")

    # UN
    if country_norm in _UN_SANCTIONS:
        findings.append(f"UN: {country_norm} is listed on the UN Security Council Consolidated Sanctions List.")
        hard_blocker = True
    else:
        findings.append(f"UN: {country_norm or entity_name} not found on UN Consolidated Sanctions List in static snapshot.")

    # EU CFSP
    if country_norm in _EU_SANCTIONS:
        findings.append(f"EU CFSP: {country_norm} is subject to EU restrictive measures.")
        hard_blocker = True
    else:
        findings.append(f"EU CFSP: {country_norm or entity_name} not found on EU Consolidated Sanctions List in static snapshot.")

    # UK OFSI
    if country_norm in _UK_OFSI:
        findings.append(f"UK OFSI: {country_norm} is subject to UK financial sanctions.")
        hard_blocker = True
    else:
        findings.append(f"UK OFSI: {country_norm or entity_name} not found on UK OFSI list in static snapshot.")

    # Partial name match warning for entity
    KNOWN_FLAGGED_KEYWORDS = [
        "rosoboronexport", "sberbank", "vtb", "gazprom", "lukoil",
        "revolutionary guard", "irgc", "hezbollah", "hamas", "wagner",
        "kim jong", "korean people's army",
    ]
    entity_flags = [kw for kw in KNOWN_FLAGGED_KEYWORDS if kw in entity_lower]
    if entity_flags:
        findings.append(
            f"ENTITY WARNING: entity name '{entity_name}' matches known SDN-linked keyword(s): {entity_flags}. "
            "Verify via live OFAC SDN search before proceeding."
        )
        hard_blocker = True

    return {
        "lists_checked": ["OFAC", "UN", "EU_CFSP", "UK_OFSI"],
        "match": hard_blocker,
        "hard_blocker": hard_blocker,
        "detail": " | ".join(findings),
        "caveat": (
            "This is a static training-data snapshot as of the model knowledge cutoff. "
            "Sanctions lists change daily. Always verify via live web search before treating as authoritative."
        ),
    }


@tool
def check_geopolitical_risk(country: str) -> dict:
    """
    Return geopolitical risk level and data sovereignty notes for a country.

    Risk levels: very_high → RED blocker, high → AMBER, medium → AMBER,
    low → GREEN (unless other checks fire).
    """
    country_norm = country.strip()
    risk = _GEO_RISK.get(country_norm, "medium")
    sovereignty = _DATA_SOVEREIGNTY.get(country_norm, "No specific data localisation requirement identified in static snapshot.")

    stability_notes: dict[str, str] = {
        "very_high": (
            f"{country_norm} is subject to comprehensive international sanctions and/or is in active conflict. "
            "Commercial SaaS delivery is likely prohibited or severely restricted."
        ),
        "high": (
            f"{country_norm} faces significant sanctions, active conflict, or severe governance instability. "
            "Substantial due diligence and possible export licence review required."
        ),
        "medium": (
            f"{country_norm} has moderate political risk, trade friction, or data localisation requirements "
            "that require attention but are not automatically blocking."
        ),
        "low": (
            f"{country_norm} has stable governance and no active comprehensive sanctions in static snapshot."
        ),
    }

    return {
        "country": country_norm,
        "risk_level": risk,
        "stability_detail": stability_notes.get(risk, ""),
        "data_sovereignty_notes": sovereignty,
        "caveat": "Verify current sanctions and trade restriction status via web_search before finalising.",
    }


@tool
def get_regulatory_requirements(country: str, industry: str = "") -> dict:
    """
    Return applicable regulatory frameworks for a country/industry combination.

    Always includes country-level data protection law. Industry-specific
    frameworks are appended where matched.
    """
    country_norm = country.strip()
    industry_norm = industry.strip().lower()

    country_regs = _COUNTRY_REGS.get(country_norm, [])
    if not country_regs:
        country_regs = ["No specific data protection law identified in static snapshot — verify via web_search."]

    industry_regs: list[str] = []
    for key, regs in _INDUSTRY_REGS.items():
        if key in industry_norm:
            industry_regs.extend(regs)

    all_regs = list(dict.fromkeys(country_regs + industry_regs))  # deduplicate, preserve order

    return {
        "country": country_norm,
        "industry": industry,
        "regulations": all_regs,
        "detail": (
            f"Country-level: {', '.join(country_regs) or 'none identified'}. "
            f"Industry-specific: {', '.join(industry_regs) or 'none identified beyond country-level'}."
        ),
        "caveat": (
            "Regulatory landscapes change. Use web_search to verify that this list is current "
            "and complete for the specific country/industry combination."
        ),
    }


@tool
def web_search(query: str) -> dict:
    """
    Search the web for recent regulatory or sanctions news.

    Uses the Tavily Search API when TAVILY_API_KEY is configured; otherwise
    returns a clearly-labelled stub so the agent knows no live data was retrieved.
    """
    if not settings.TAVILY_API_KEY:
        return {
            "query": query,
            "results": [],
            "live": False,
            "stub_warning": (
                "web_search is not connected to a live search API (TAVILY_API_KEY not set). "
                "No live results were retrieved. Set the web_search status to 'inconclusive' "
                "and note in the report that manual verification is required via official "
                "sources: OFAC SDN search (sanctionssearch.ofac.treas.gov), UN Consolidated "
                "Sanctions List (scsanctions.un.org), EU Consolidated Sanctions List "
                "(eeas.europa.eu/cfsp), UK OFSI (gov.uk/ofsi)."
            ),
        }

    try:
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": settings.TAVILY_API_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 5,
                "include_answer": False,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        results = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", "")[:400],
                "published_date": r.get("published_date", ""),
            }
            for r in data.get("results", [])
        ]
        return {"query": query, "results": results, "live": True}
    except Exception as exc:
        logger.warning("Tavily search failed for query %r: %s", query, exc)
        return {
            "query": query,
            "results": [],
            "live": False,
            "stub_warning": (
                f"Live web search failed ({type(exc).__name__}). "
                "Set web_search status to 'inconclusive' and flag for manual review."
            ),
        }


_FEASIBILITY_TOOLS = [
    check_ofac_sanctions,
    check_geopolitical_risk,
    get_regulatory_requirements,
    web_search,
]

# Build the ReAct agent once at module load — reused across all requests.
# get_llm() is called once here; restart the server/worker to pick up LLM changes.
_feasibility_agent = create_react_agent(
    model=get_llm(),
    tools=_FEASIBILITY_TOOLS,
)

FEASIBILITY_PROMPT = """You are a compliance and geopolitical risk analyst AI conducting a \
feasibility assessment for a client project. This output directly affects whether a project \
can legally proceed, and injected requirements become part of a binding PRD — accuracy and \
honesty about uncertainty matter more than completeness. Never assert a fact you have not \
actually verified via a tool call in this session.

Client: {client_name}
Country/Region: {country}
Industry: {industry}
Project type / description: {description}
Assessment date: {assessment_date}

## What you must do

Run all four checks below using your available tools (live web search, sanctions lookup). \
Do not rely on memorized/training-data knowledge for any sanctions or regulatory status — \
sanctions lists and laws change frequently, and your training data may be outdated. If a \
tool call fails or returns no result, say so explicitly rather than filling in a plausible \
guess.

### 1. Sanctions screening
Check the client's country, and the named client entity if identifiable, against all four \
of these lists. Check each one individually — do not assume a country's status on one list \
implies the same status on another.
  - OFAC (US Office of Foreign Assets Control) — SDN list and sectoral sanctions
  - UN Security Council Consolidated Sanctions List
  - EU Consolidated Sanctions List (CFSP)
  - UK OFSI (Office of Financial Sanctions Implementation)

### 2. Geopolitical risk
Assess: political stability, active trade restrictions or embargoes affecting this country, \
and data sovereignty / data localization laws that would affect a cloud-hosted SaaS product \
operating there.

### 3. Regulatory mapping
Map the country AND industry combination to applicable frameworks. Use this logic as a \
starting point, then verify currency via search — do not assume this list is exhaustive or \
unchanged:
  - Data protection: GDPR (EU/EEA), PDPA (Thailand/Singapore), LGPD (Brazil), PIPL (China),
    CCPA/CPRA (US-California)
  - Healthcare industry: HIPAA (US), or equivalent local health-data law
  - Fintech/payments industry: PCI-DSS, plus local financial services regulator requirements
  - Any industry: ISO 27001, SOC 2 if enterprise security posture is relevant
  - US government/defense-adjacent: FedRAMP
  - Export control: ITAR (US defense-related tech), EAR (dual-use technology) — check if the
    project involves technology that could fall under export restrictions
  - Local technology restrictions: internet regulations, cloud data residency mandates
For industries not explicitly listed above, search for and identify the actual applicable
framework rather than returning a generic answer — you must research, not template.

### 4. Live web search for recent developments
Search specifically for regulatory changes, new sanctions actions, or enforcement actions \
in the last 12 months relevant to this country/industry combination. Recent enforcement \
actions are a signal of active regulatory risk even where no new law has been written.

## Status definitions — apply these exactly, do not improvise your own criteria

**GREEN** — Project is feasible with standard compliance. No sanctions hits on any list, \
no active embargoes, country has stable governance, and the only applicable requirements are \
ordinary baseline practices (e.g. standard data protection hygiene with no specific named law \
triggered).

**AMBER** — Project is feasible but requires additional compliance work before or during \
delivery. Triggers include: client operates in a GDPR-applicable territory, industry is \
HIPAA/PCI-DSS-regulated, country has data localization/residency laws, or moderate political/ \
trade instability exists that does not amount to a full embargo.

**RED** — Hard blocker. Project cannot proceed as scoped. Triggers include: country or named \
entity appears on any sanctions list checked above, project involves technology subject to \
export control (ITAR/EAR) that the client is not licensed for, or a comprehensive trade \
embargo applies.

If checks return mixed signals (e.g. sanctions clear but severe geopolitical instability), \
overall_status should reflect the single highest-severity finding across all four checks — \
RED beats AMBER beats GREEN.

## Required output schema

Return a single JSON object with exactly this structure. Every "detail" field must be a \
specific, factual sentence — not a vague placeholder like "some risk exists."

{{
  "assessment_date": "{assessment_date}",
  "overall_status": "green" | "amber" | "red",
  "overall_status_reasoning": "one sentence explaining which check drove this status",
  "sanctions": {{
    "status": "clear" | "flagged" | "inconclusive",
    "lists_checked": ["OFAC", "UN", "EU_CFSP", "UK_OFSI"],
    "detail": "specific finding per list, or confirmation all four returned clear",
    "is_hard_blocker": true | false,
    "source_urls": ["actual URLs retrieved during search, empty array if none used"]
  }},
  "geopolitical": {{
    "status": "stable" | "caution" | "high_risk",
    "risk_level": "low" | "medium" | "high",
    "detail": "specific factual finding, not a generic statement",
    "data_sovereignty_notes": "any data localization or residency requirement found, or 'none identified'"
  }},
  "regulatory": {{
    "status": "standard" | "additional_requirements" | "complex",
    "required_compliances": [
      {{"framework": "GDPR", "reason": "client is in EU territory", "article_or_section": "if applicable, else null"}}
    ],
    "detail": "summary of why these frameworks apply"
  }},
  "web_search": {{
    "status": "no_new_findings" | "relevant_findings",
    "findings": [
      {{"summary": "one sentence", "date": "approximate date of the development", "source_url": "url"}}
    ]
  }},
  "injected_nfrs": [
    {{
      "section": "non_functional_requirements",
      "content": "The system shall... (specific, actionable compliance requirement)",
      "regulation": "name of the specific law/framework/article driving this, e.g. GDPR Article 17",
      "source": "Feasibility Agent",
      "confidence": 0.0
    }}
  ],
  "hard_blockers": [
    {{
      "type": "sanctions" | "export_control" | "embargo",
      "detail": "specific factual basis for this blocker",
      "override_allowed_by": "Admin only — BA/PM cannot override a hard blocker",
      "override_required": true
    }}
  ]
}}

## Rules

1. If overall_status is "red", hard_blockers must contain at least one item. If it is not
   "red", hard_blockers must be an empty array.
2. injected_nfrs must only contain items tied to a specific named regulation or framework —
   never inject a vague requirement like "ensure good security practices."
3. Every entry in required_compliances must have a stated reason — do not list a framework
   "just in case" without justification.
4. If you were unable to verify something via search (tool failure, no results, ambiguous
   country name), set the relevant status to "inconclusive" and explain why in detail rather
   than defaulting to "clear" or "green."
5. confidence in injected_nfrs reflects how certain you are this specific requirement is
   legally required (not optional best-practice) — use 0.9+ only for well-established,
   clearly-applicable legal requirements.

Return ONLY the JSON object. No markdown code fences, no explanation, no preamble."""


async def run_feasibility_check(
    client_name: str, country: str, industry: str, description: str,
    assessment_date: str = "",
) -> dict:
    prompt = FEASIBILITY_PROMPT.format(
        client_name=client_name, country=country,
        industry=industry, description=description,
        assessment_date=assessment_date,
    )
    result = await _feasibility_agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]}
    )
    # The last message is the agent's final AIMessage containing the JSON output.
    raw = result["messages"][-1].content.strip()
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
