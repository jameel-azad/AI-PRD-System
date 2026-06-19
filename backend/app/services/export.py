"""
PRD export service — converts a PRDVersion content dict to Markdown, PDF, or DOCX.

Each function accepts:
  prd_content : dict   — the PRDVersion.content JSON (section_key → {content, ...})
  project_name: str    — shown in the title / cover page

export_prd() is the unified entry point; it returns (bytes, content_type, filename).
"""
from __future__ import annotations

import io
import logging
import re
from datetime import date

logger = logging.getLogger(__name__)

# Pretty labels for section keys (snake_case → readable)
_SECTION_LABELS: dict[str, str] = {
    "project_overview":           "Project Overview",
    "business_objectives":        "Business Objectives",
    "stakeholders_personas":      "Stakeholders & Personas",
    "scope":                      "Scope",
    "functional_requirements":    "Functional Requirements",
    "non_functional_requirements": "Non-Functional Requirements",
    "user_stories":               "User Stories",
    "technical_constraints":      "Technical Constraints",
    "data_requirements":          "Data Requirements",
    "timeline_milestones":        "Timeline & Milestones",
    "assumptions_dependencies":   "Assumptions & Dependencies",
    "glossary":                   "Glossary",
    "open_questions":             "Open Questions",
    "source_index":               "Source Index",
}


def _label(key: str) -> str:
    return _SECTION_LABELS.get(key, key.replace("_", " ").title())


def _section_text(data) -> str:
    """Extract the prose content from a section data value."""
    if isinstance(data, dict):
        return data.get("content", "")
    if isinstance(data, list):
        return "\n".join(
            item.get("question", str(item)) if isinstance(item, dict) else str(item)
            for item in data
        )
    return str(data) if data else ""


def _iter_sections(prd_content: dict):
    """Yield (key, label, text) for each real PRD section in display order."""
    # Emit in canonical order first, then any unexpected keys.
    seen = set()
    for key in _SECTION_LABELS:
        if key in prd_content:
            text = _section_text(prd_content[key])
            yield key, _label(key), text
            seen.add(key)
    for key, val in prd_content.items():
        if key not in seen and not key.startswith("_"):
            yield key, _label(key), _section_text(val)


# ── Markdown ──────────────────────────────────────────────────────────────────

def export_markdown(prd_content: dict, project_name: str) -> bytes:
    lines: list[str] = [
        f"# {project_name}",
        "",
        "**Product Requirements Document**",
        f"*Generated: {date.today().isoformat()}*",
        "",
        "---",
        "",
    ]
    for _key, label, text in _iter_sections(prd_content):
        lines.append(f"## {label}")
        lines.append("")
        lines.append(text.strip() if text.strip() else "*No content generated for this section.*")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Append gap questions if present
    gaps = prd_content.get("_gaps", [])
    if gaps:
        lines.append("## Open Gap Questions")
        lines.append("")
        for i, g in enumerate(gaps, 1):
            section = g.get("section", "")
            question = g.get("question", str(g))
            priority = g.get("priority", "medium")
            lines.append(f"{i}. **[{priority.upper()}]** *{_label(section)}* — {question}")
        lines.append("")

    return "\n".join(lines).encode("utf-8")


# ── PDF ───────────────────────────────────────────────────────────────────────

def _safe_latin(text: str) -> str:
    """Encode text to latin-1, replacing unrepresentable characters with '?'."""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def export_pdf(prd_content: dict, project_name: str) -> bytes:
    try:
        from fpdf import FPDF
    except ImportError:
        logger.error("fpdf2 is not installed — cannot generate PDF")
        raise RuntimeError("fpdf2 package is required for PDF export. Run: pip install fpdf2")

    class PRDPdf(FPDF):
        def header(self):
            if self.page_no() == 1:
                return
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 8, _safe_latin(f"Xccelera PRD Portal — {project_name}"), align="R")
            self.ln(2)
            self.set_draw_color(220, 220, 220)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(4)

        def footer(self):
            if self.page_no() == 1:
                return
            self.set_y(-14)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 8, f"Page {self.page_no()}", align="C")

    pdf = PRDPdf(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(left=20, top=20, right=20)

    # ── Cover page ────────────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_fill_color(15, 15, 20)
    pdf.rect(0, 0, 210, 297, "F")

    # Purple accent bar
    pdf.set_fill_color(124, 110, 230)
    pdf.rect(0, 110, 210, 4, "F")

    pdf.set_y(60)
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(0, 12, _safe_latin(project_name), align="C")

    pdf.ln(8)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(155, 138, 255)
    pdf.cell(0, 8, "Product Requirements Document", align="C")

    pdf.ln(20)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(160, 160, 180)
    pdf.cell(0, 6, _safe_latin(f"Generated: {date.today().isoformat()}"), align="C")
    pdf.ln(4)
    pdf.cell(0, 6, "Xccelera PRD Portal", align="C")

    # ── Sections ──────────────────────────────────────────────────────────
    for _key, label, text in _iter_sections(prd_content):
        pdf.add_page()

        # Section heading
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(15, 15, 20)
        pdf.cell(0, 10, _safe_latin(label), ln=True)

        pdf.set_draw_color(124, 110, 230)
        pdf.set_line_width(0.5)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
        pdf.ln(6)

        # Body text
        pdf.set_font("Helvetica", "", 10.5)
        pdf.set_text_color(50, 50, 60)
        content = text.strip() if text.strip() else "No content generated for this section."
        pdf.multi_cell(0, 6, _safe_latin(content))

    # ── Gap questions ─────────────────────────────────────────────────────
    gaps = prd_content.get("_gaps", [])
    if gaps:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(15, 15, 20)
        pdf.cell(0, 10, "Open Gap Questions", ln=True)
        pdf.set_draw_color(230, 180, 50)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
        pdf.ln(6)

        for i, g in enumerate(gaps, 1):
            section = _label(g.get("section", ""))
            question = g.get("question", str(g))
            priority = g.get("priority", "medium").upper()

            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(80, 60, 180)
            pdf.cell(0, 6, _safe_latin(f"{i}. [{priority}] {section}"), ln=True)

            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(50, 50, 60)
            pdf.multi_cell(0, 5.5, _safe_latin(question))
            pdf.ln(3)

    return bytes(pdf.output())


# ── DOCX ──────────────────────────────────────────────────────────────────────

def export_docx(prd_content: dict, project_name: str) -> bytes:
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor, Inches
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        logger.error("python-docx is not installed — cannot generate DOCX")
        raise RuntimeError("python-docx package is required for DOCX export. Run: pip install python-docx")

    doc = Document()

    # ── Page margins ──────────────────────────────────────────────────────
    for section in doc.sections:
        section.top_margin    = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin   = Inches(1.1)
        section.right_margin  = Inches(1.1)

    # ── Cover ─────────────────────────────────────────────────────────────
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title_para.add_run(project_name)
    run.bold = True
    run.font.size = Pt(28)
    run.font.color.rgb = RGBColor(0x0F, 0x0F, 0x14)

    sub_para = doc.add_paragraph()
    sub_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = sub_para.add_run("Product Requirements Document")
    sub_run.font.size = Pt(14)
    sub_run.font.color.rgb = RGBColor(0x7C, 0x6E, 0xE6)

    date_para = doc.add_paragraph()
    date_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_run = date_para.add_run(f"Generated: {date.today().isoformat()}")
    date_run.font.size = Pt(10)
    date_run.font.color.rgb = RGBColor(0x80, 0x80, 0x90)

    doc.add_page_break()

    # ── Sections ──────────────────────────────────────────────────────────
    for _key, label, text in _iter_sections(prd_content):
        heading = doc.add_heading(label, level=1)
        heading.runs[0].font.color.rgb = RGBColor(0x0F, 0x0F, 0x14)

        body = text.strip() if text.strip() else "No content generated for this section."
        para = doc.add_paragraph(body)
        para.style.font.size = Pt(10.5)
        doc.add_paragraph()  # spacer

    # ── Gap questions ─────────────────────────────────────────────────────
    gaps = prd_content.get("_gaps", [])
    if gaps:
        doc.add_page_break()
        heading = doc.add_heading("Open Gap Questions", level=1)
        heading.runs[0].font.color.rgb = RGBColor(0xD9, 0x7B, 0x06)

        for i, g in enumerate(gaps, 1):
            section = _label(g.get("section", ""))
            question = g.get("question", str(g))
            priority = g.get("priority", "medium").upper()

            q_para = doc.add_paragraph()
            label_run = q_para.add_run(f"{i}. [{priority}] {section} — ")
            label_run.bold = True
            label_run.font.color.rgb = RGBColor(0x50, 0x3C, 0xB4)
            q_para.add_run(question)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── Unified entry point ───────────────────────────────────────────────────────

def export_prd(
    prd_content: dict,
    project_name: str,
    fmt: str,
) -> tuple[bytes, str, str]:
    """
    Export a PRD in the requested format.

    Returns (data_bytes, content_type, filename).
    Raises ValueError for unsupported formats.
    """
    fmt = fmt.lower().strip()
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", project_name)[:60]

    if fmt == "md" or fmt == "markdown":
        data = export_markdown(prd_content, project_name)
        return data, "text/markdown; charset=utf-8", f"{safe_name}_PRD.md"

    if fmt == "pdf":
        data = export_pdf(prd_content, project_name)
        return data, "application/pdf", f"{safe_name}_PRD.pdf"

    if fmt == "docx":
        data = export_docx(prd_content, project_name)
        return data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", f"{safe_name}_PRD.docx"

    raise ValueError(f"Unsupported export format: {fmt!r}. Use 'pdf', 'docx', or 'md'.")
