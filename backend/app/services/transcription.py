import asyncio
import os
import subprocess
import tempfile

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.storage import storage_service

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

MAX_API_BYTES = 24 * 1024 * 1024   # 24 MB (Whisper API hard limit is 25 MB)
CHUNK_SECONDS = 600                 # 10-minute chunks when splitting large files


def _extract_audio(input_path: str, output_path: str) -> None:
    """Strip video track, compress to 16 kHz mono 16 kbps mp3 (≈7 MB/hour)."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-vn", "-ac", "1", "-ar", "16000", "-ab", "16k", output_path],
        check=True,
        capture_output=True,
    )


def _split_audio(input_path: str, chunk_duration: int) -> list[tuple[str, float]]:
    """Split audio into fixed-duration chunks. Returns (path, start_offset_seconds) pairs."""
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", input_path],
        capture_output=True, text=True, check=True,
    )
    total = float(probe.stdout.strip())
    chunks: list[tuple[str, float]] = []
    start = 0.0
    while start < total:
        path = f"{input_path}_chunk_{int(start):06d}.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(start), "-t", str(chunk_duration),
             "-i", input_path, "-c", "copy", path],
            check=True, capture_output=True,
        )
        chunks.append((path, start))
        start += chunk_duration
    return chunks


async def _transcribe_chunk(audio_path: str, start_offset: float) -> dict:
    """Send one audio file to the Whisper API; adjust timestamps by start_offset."""
    with open(audio_path, "rb") as f:
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    segments = [
        {
            "text": seg.text,
            "start": round(seg.start + start_offset, 2),
            "end":   round(seg.end   + start_offset, 2),
            "low_confidence": getattr(seg, "avg_logprob", 0.0) < -1.0,
        }
        for seg in transcript.segments
    ]
    return {"full_text": transcript.text, "segments": segments}


async def transcribe(storage_key: str) -> dict:
    """
    Download file, extract/compress audio with ffmpeg, transcribe via Whisper API.

    Returns:
        {
            "full_text": str,
            "segments": [{"text", "start", "end", "low_confidence"}]
        }

    Timestamps are absolute seconds from the start of the original recording,
    used for source citations like [Source: file.mp4 → 08:14].
    Files > 24 MB are split into 10-minute chunks; timestamps are offset accordingly.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        raw_path = os.path.join(tmpdir, "input.tmp")
        await storage_service.download(storage_key, raw_path)

        compressed_path = os.path.join(tmpdir, "audio.mp3")
        await asyncio.to_thread(_extract_audio, raw_path, compressed_path)

        compressed_size = os.path.getsize(compressed_path)

        if compressed_size <= MAX_API_BYTES:
            return await _transcribe_chunk(compressed_path, start_offset=0.0)

        # Large file: split and call API per chunk, then merge
        chunks = await asyncio.to_thread(_split_audio, compressed_path, CHUNK_SECONDS)
        chunk_results = await asyncio.gather(
            *[_transcribe_chunk(path, offset) for path, offset in chunks]
        )
        return {
            "full_text": " ".join(r["full_text"] for r in chunk_results),
            "segments":  [seg for r in chunk_results for seg in r["segments"]],
        }
