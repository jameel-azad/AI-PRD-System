"""
Email notification service.

All send_* functions are fire-and-forget: they swallow exceptions and log them
so a broken SMTP config never crashes the pipeline or an API request.

Set SMTP_ENABLED=true in .env to activate. While false (the default), every
function just logs at INFO level and returns immediately.
"""
import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Shared HTML chrome ─────────────────────────────────────────────────────────

_STYLES = """
  body { margin:0; padding:0; background:#f5f5f7; font-family: -apple-system, Helvetica, Arial, sans-serif; }
  .wrap { max-width:580px; margin:32px auto; background:#fff; border-radius:12px;
          box-shadow:0 2px 12px rgba(0,0,0,.08); overflow:hidden; }
  .header { background:#0f0f14; padding:28px 32px; }
  .header h1 { margin:0; color:#fff; font-size:18px; font-weight:600; letter-spacing:-.3px; }
  .header span { color:#9b8aff; }
  .body { padding:28px 32px 8px; }
  .body p { margin:0 0 16px; color:#333; font-size:14.5px; line-height:1.65; }
  .btn { display:inline-block; margin:8px 0 24px; padding:11px 22px; background:#7c6ee6;
         color:#fff !important; text-decoration:none; border-radius:8px;
         font-size:14px; font-weight:600; }
  .list { margin:0 0 20px; padding:0 0 0 20px; color:#333; font-size:14px; line-height:1.8; }
  .footer { background:#f9f9fb; border-top:1px solid #eee; padding:16px 32px;
            color:#999; font-size:12px; }
  .tag { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px;
         font-weight:600; }
  .tag-green  { background:#d1fae5; color:#065f46; }
  .tag-amber  { background:#fef3c7; color:#92400e; }
  .tag-red    { background:#fee2e2; color:#991b1b; }
"""


def _wrap(header_title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>{_STYLES}</style></head><body>
<div class="wrap">
  <div class="header"><h1>Xccelera <span>PRD</span> Portal</h1></div>
  <div class="body">
    <p style="font-size:17px;font-weight:600;color:#111;margin-bottom:20px">{header_title}</p>
    {body_html}
  </div>
  <div class="footer">You received this because you are part of the Xccelera PRD Portal.
  Do not reply to this email.</div>
</div></body></html>"""


def _project_link(project_id: int) -> str:
    return f"{settings.APP_BASE_URL}/projects/{project_id}"


# ── Low-level send ─────────────────────────────────────────────────────────────

def _send_sync(to: str, subject: str, html: str) -> None:
    if not settings.SMTP_ENABLED:
        logger.info("Email (disabled): to=%s subject=%s", to, subject)
        return
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)
    logger.info("Email sent: to=%s subject=%s", to, subject)


async def _send(to: str, subject: str, html: str) -> None:
    """Fire-and-forget async wrapper — never raises."""
    try:
        await asyncio.to_thread(_send_sync, to, subject, html)
    except Exception:
        logger.exception("Email failed: to=%s subject=%s", to, subject)


# ── Notification functions ─────────────────────────────────────────────────────

async def send_prd_ready(
    project_name: str,
    owner_email: str,
    owner_name: str,
    project_id: int,
) -> None:
    """Sent to the project owner when the AI pipeline finishes generating the PRD."""
    first = owner_name.split()[0] if owner_name else "there"
    body = f"""
    <p>Hi {first},</p>
    <p>The AI pipeline has finished processing <strong>{project_name}</strong>.
    Your Product Requirements Document is ready for review.</p>
    <a class="btn" href="{_project_link(project_id)}">Open PRD →</a>
    <p>Next steps:</p>
    <ul class="list">
      <li>Review the generated sections and gap questions</li>
      <li>Run a feasibility check if you haven't already</li>
      <li>Move the project to <em>Client Review</em> when ready</li>
    </ul>"""
    await _send(owner_email, f"PRD ready — {project_name}", _wrap("Your PRD is ready 🎉", body))


async def send_approval_requested(
    project_name: str,
    approver_email: str,
    approver_name: str,
    project_id: int,
) -> None:
    """Sent to the approver when a PRD is submitted for client review."""
    first = approver_name.split()[0] if approver_name else "there"
    body = f"""
    <p>Hi {first},</p>
    <p>A PRD has been submitted for your approval: <strong>{project_name}</strong>.</p>
    <a class="btn" href="{_project_link(project_id)}">Review &amp; Approve →</a>
    <p>Please review all sections, check for open gap questions, and either
    approve or request changes via the comments panel.</p>"""
    await _send(approver_email, f"Approval requested — {project_name}", _wrap("PRD approval requested", body))


async def send_approved(
    project_name: str,
    owner_email: str,
    owner_name: str,
    approver_name: str,
    project_id: int,
) -> None:
    """Sent to the project owner when the PRD is approved."""
    first = owner_name.split()[0] if owner_name else "there"
    body = f"""
    <p>Hi {first},</p>
    <p><strong>{project_name}</strong> has been approved by <strong>{approver_name}</strong>.
    The PRD is now locked and the project stage has been moved to <em>Approved</em>.</p>
    <a class="btn" href="{_project_link(project_id)}">View approved PRD →</a>"""
    await _send(owner_email, f"Approved ✅ — {project_name}", _wrap("PRD approved", body))


async def send_gap_review_needed(
    project_name: str,
    owner_email: str,
    owner_name: str,
    gap_count: int,
    project_id: int,
) -> None:
    """Sent after gap analysis finds open questions that need client input."""
    first = owner_name.split()[0] if owner_name else "there"
    body = f"""
    <p>Hi {first},</p>
    <p>Gap analysis for <strong>{project_name}</strong> has surfaced
    <strong>{gap_count} open question{'' if gap_count == 1 else 's'}</strong>
    that need client clarification before the PRD can be finalised.</p>
    <a class="btn" href="{_project_link(project_id)}">Review gap questions →</a>
    <p>Send these questions to your client and update the PRD once you have answers.</p>"""
    await _send(
        owner_email,
        f"{gap_count} gap question{'s' if gap_count != 1 else ''} — {project_name}",
        _wrap("Gap review needed", body),
    )


async def send_prd_regenerated(
    project_name: str,
    owner_email: str,
    owner_name: str,
    version: int,
    gap_count: int,
    comment_count: int,
    project_id: int,
) -> None:
    """Sent to the project owner when a PRD is regenerated from gap answers and resolved comments."""
    first = owner_name.split()[0] if owner_name else "there"
    body = f"""
    <p>Hi {first},</p>
    <p>The PRD for <strong>{project_name}</strong> has been regenerated
    (version {version}) incorporating <strong>{gap_count} gap answer{'' if gap_count == 1 else 's'}</strong>
    and <strong>{comment_count} resolved comment{'' if comment_count == 1 else 's'}</strong>.</p>
    <a class="btn" href="{_project_link(project_id)}">Open PRD →</a>
    <p>Review the updated document and advance the project when ready.</p>"""
    await _send(
        owner_email,
        f"PRD updated — {project_name}",
        _wrap(f"PRD regenerated (v{version})", body),
    )


async def send_feasibility_flag(
    project_name: str,
    owner_email: str,
    owner_name: str,
    status: str,
    project_id: int,
) -> None:
    """Sent when feasibility check returns amber or red."""
    if status == "green":
        return
    first = owner_name.split()[0] if owner_name else "there"
    tag_class = "tag-red" if status == "red" else "tag-amber"
    label = "HARD BLOCKER" if status == "red" else "CAUTION"
    body = f"""
    <p>Hi {first},</p>
    <p>Feasibility check for <strong>{project_name}</strong> returned:
    <span class="tag {tag_class}">{label}</span></p>
    <a class="btn" href="{_project_link(project_id)}">View feasibility report →</a>
    <p>Review the sanctions, geopolitical, and regulatory findings before proceeding.
    {"A hard blocker requires admin override before the project can advance." if status == "red" else "Amber findings require additional compliance work but do not block progress."}</p>"""
    subject = f"{'🚫 Hard blocker' if status == 'red' else '⚠️ Caution'} — {project_name} feasibility"
    await _send(owner_email, subject, _wrap("Feasibility alert", body))
