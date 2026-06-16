def score_completeness(prd: dict) -> dict:
    """
    Returns per-section scores and traffic-light status.
    Green >= 0.8 | Amber 0.4–0.79 | Red < 0.4
    """
    scores: dict = {}
    for section, data in prd.items():
        if section.startswith("_"):
            continue
        score = data.get("completeness", 0.0) if isinstance(data, dict) else 0.0
        scores[section] = {
            "score": score,
            "status": "green" if score >= 0.8 else "amber" if score >= 0.4 else "red",
        }
    overall = sum(s["score"] for s in scores.values()) / len(scores) if scores else 0.0
    return {"sections": scores, "overall": round(overall, 3)}
