from typing import Optional
from typing_extensions import TypedDict


class PipelineState(TypedDict):
    # ── input ────────────────────────────────────────────────────────
    source_file_id: int

    # ── after load_source_file ───────────────────────────────────────
    project_id: int
    storage_key: str
    filename: str
    file_type: str
    existing_transcript: Optional[str]   # already-stored text (non-audio files)

    # ── after transcribe ─────────────────────────────────────────────
    transcript: str

    # ── after chunk_and_extract ──────────────────────────────────────
    requirements: list       # list[dict] — [{section, content, source_refs, embedding, confidence}]

    # ── after generate_prd_node ──────────────────────────────────────
    prd_content: dict        # {section_name: {content, completeness, requirement_count}}

    # ── after analyse_gaps_node ──────────────────────────────────────
    gaps: list               # list[dict] — [{section, question, priority}]

    # ── after score_completeness_node ────────────────────────────────
    scores: dict             # {overall: float, status: green|amber|red, sections: {}}

    # ── control ──────────────────────────────────────────────────────
    error: Optional[str]
