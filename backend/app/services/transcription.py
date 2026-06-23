import asyncio
import logging
import os
import subprocess
import tempfile

from openai import AsyncOpenAI, APIError, APITimeoutError, RateLimitError

from app.core.config import settings
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

# NOTE: PRD v1.2 (section 7) specifies Whisper as "self-hosted on GCP Cloud Run."
# This module instead calls OpenAI's hosted Whisper API, which sends raw client
# audio/video to a third party outside your GCP project boundary. Confirm with
# the team whether this is an intentional deviation - it directly affects the
# "client data never leaves their dedicated GCP project" guarantee made to
# enterprise customers in section 6 of the PRD.
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

MAX_API_BYTES = 24 * 1024 * 1024   # 24 MB (Whisper API hard limit is 25 MB)
CHUNK_SECONDS = 600                 # 10-minute chunks when splitting large files
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2                # seconds; doubles each attempt


class TranscriptionError(Exception):
    """Raised when transcription fails after all retries are exhausted."""


def _check_ffmpeg() -> None:
    """Raise TranscriptionError immediately if ffmpeg or ffprobe is missing."""
    import shutil
    missing = [tool for tool in ("ffmpeg", "ffprobe") if not shutil.which(tool)]
    if missing:
        raise TranscriptionError(
            f"{', '.join(missing)} not found in PATH. "
            "Install ffmpeg to enable audio/video transcription "
            "(Windows: `choco install ffmpeg`, Linux: `apt install ffmpeg`)."
        )


def _run_ffmpeg(cmd: list[str], context: str) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except FileNotFoundError as exc:
        raise TranscriptionError(
            "ffmpeg not found — install it and restart the server"
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode(errors="replace") if exc.stderr else ""
        logger.error("%s failed: %s", context, stderr[-2000:])  # last 2KB, ffmpeg errors are verbose
        raise TranscriptionError(f"{context} failed - see logs for ffmpeg stderr") from exc


def _extract_audio(input_path: str, output_path: str) -> None:
    """Strip video track, compress to 16 kHz mono 16 kbps mp3 (~7 MB/hour)."""
    if not os.path.exists(input_path) or os.path.getsize(input_path) == 0:
        raise TranscriptionError(f"Downloaded file is missing or empty: {input_path}")
    _run_ffmpeg(
        ["ffmpeg", "-y", "-i", input_path, "-vn", "-ac", "1", "-ar", "16000", "-ab", "16k", output_path],
        context="audio extraction",
    )


def _split_audio(input_path: str, chunk_duration: int) -> list[tuple[str, float]]:
    """Split audio into fixed-duration chunks. Returns (path, start_offset_seconds) pairs.

    Re-encodes each chunk rather than stream-copying. MP3 frames are not
    independently seekable, so `-c copy` at an arbitrary -ss offset can produce
    a corrupted or duration-drifted first frame in each chunk - which would
    silently throw off every citation timestamp downstream. Re-encoding is
    slightly slower but produces clean, correctly-timed chunks.
    """
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", input_path],
        capture_output=True, text=True, check=True,
    )
    try:
        total = float(probe.stdout.strip())
    except ValueError as exc:
        raise TranscriptionError(f"Could not determine duration of {input_path}") from exc

    chunks: list[tuple[str, float]] = []
    start = 0.0
    while start < total:
        path = f"{input_path}_chunk_{int(start):06d}.mp3"
        _run_ffmpeg(
            [
                "ffmpeg", "-y", "-ss", str(start), "-t", str(chunk_duration),
                "-i", input_path, "-ac", "1", "-ar", "16000", "-ab", "16k", path,
            ],
            context=f"chunk split at offset {start}s",
        )
        chunks.append((path, start))
        start += chunk_duration
    return chunks


async def _call_whisper_with_retry(audio_path: str):
    """Call the Whisper API with retry/backoff on transient failures."""
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with open(audio_path, "rb") as f:
                return await client.audio.transcriptions.create(
                    model=settings.OPENAI_WHISPER_MODEL,
                    file=f,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )
        except (RateLimitError, APITimeoutError, APIError) as exc:
            last_error = exc
            logger.warning(
                "Whisper API call failed for %s (attempt %d/%d): %s",
                audio_path, attempt, MAX_RETRIES, exc,
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** (attempt - 1)))

    raise TranscriptionError(
        f"Whisper API failed after {MAX_RETRIES} attempts for {audio_path}: {last_error}"
    ) from last_error


async def _transcribe_chunk(audio_path: str, start_offset: float) -> dict:
    """Send one audio file to the Whisper API; adjust timestamps by start_offset."""
    transcript = await _call_whisper_with_retry(audio_path)

    segments = []
    for seg in transcript.segments:
        avg_logprob = getattr(seg, "avg_logprob", None)
        # If the API omits confidence entirely, flag it for manual review rather
        # than silently defaulting to "high confidence" - missing data is itself
        # a signal something is off with this segment.
        low_confidence = avg_logprob is None or avg_logprob < -1.0
        segments.append({
            "text": seg.text,
            "start": round(seg.start + start_offset, 2),
            "end": round(seg.end + start_offset, 2),
            "low_confidence": low_confidence,
            "confidence_unavailable": avg_logprob is None,
        })

    return {"full_text": transcript.text, "segments": segments}


async def _download_with_retry(storage_key: str, dest_path: str) -> None:
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            await storage_service.download(storage_key, dest_path)
            return
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Download failed for %s (attempt %d/%d): %s",
                storage_key, attempt, MAX_RETRIES, exc,
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** (attempt - 1)))

    raise TranscriptionError(
        f"Failed to download {storage_key} after {MAX_RETRIES} attempts: {last_error}"
    ) from last_error


async def transcribe(storage_key: str) -> dict:
    """
    Download file, extract/compress audio with ffmpeg, transcribe via Whisper API.

    Returns:
        {
            "full_text": str,
            "segments": [{"text", "start", "end", "low_confidence", "confidence_unavailable"}]
        }

    Timestamps are absolute seconds from the start of the original recording,
    used for source citations like [Source: file.mp4 -> 08:14].
    Files > 24 MB are split into 10-minute chunks; timestamps are offset accordingly.

    Raises:
        TranscriptionError: if download, audio extraction, or the Whisper API
        call fails after retries. Callers (e.g. the Pub/Sub worker) should catch
        this, mark the source_file status as 'failed', and surface it to the BA/PM
        rather than letting the exception propagate unhandled.
    """
    _check_ffmpeg()

    with tempfile.TemporaryDirectory() as tmpdir:
        raw_path = os.path.join(tmpdir, "input.tmp")
        await _download_with_retry(storage_key, raw_path)

        compressed_path = os.path.join(tmpdir, "audio.mp3")
        await asyncio.to_thread(_extract_audio, raw_path, compressed_path)

        compressed_size = os.path.getsize(compressed_path)

        if compressed_size <= MAX_API_BYTES:
            return await _transcribe_chunk(compressed_path, start_offset=0.0)

        # Large file: split and call API per chunk, then merge.
        # Note: gather() runs chunks concurrently. If one chunk fails after
        # exhausting retries, the exception propagates and ALL chunks' results
        # are discarded, even ones that succeeded - this is intentional, since
        # a transcript with a missing 10-minute gap is misleading to a BA who
        # doesn't know it's incomplete. Callers should retry the whole file on
        # failure rather than attempt partial recovery.
        chunks = await asyncio.to_thread(_split_audio, compressed_path, CHUNK_SECONDS)
        try:
            chunk_results = await asyncio.gather(
                *[_transcribe_chunk(path, offset) for path, offset in chunks]
            )
        except TranscriptionError:
            logger.error("Transcription failed for storage_key=%s on one or more chunks", storage_key)
            raise

        return {
            "full_text": " ".join(r["full_text"] for r in chunk_results),
            "segments": [seg for r in chunk_results for seg in r["segments"]],
        }