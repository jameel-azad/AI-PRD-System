# Gap analysis is handled by app.services.prd_generator.analyse_gaps.
# This module is kept for any internal keyword-based section scoring utilities.

PRD_SECTIONS: dict[str, list[str]] = {
    "project_overview":             ["goal", "purpose", "background"],
    "business_objectives":          ["metric", "kpi", "success"],
    "stakeholders_personas":        ["user", "persona", "role"],
    "scope":                        ["in scope", "out of scope"],
    "functional_requirements":      ["shall", "must", "should", "feature"],
    "non_functional_requirements":  ["performance", "security", "availability"],
    "user_stories":                 ["as a user", "i want", "so that"],
    "technical_constraints":        ["technology", "integration", "api"],
    "data_requirements":            ["data", "storage", "database"],
    "timeline_milestones":          ["deadline", "milestone", "launch", "week"],
    "assumptions_dependencies":     ["assume", "dependency", "depend"],
    "open_questions":               [],
    "glossary":                     [],
    "source_index":                 [],
}
