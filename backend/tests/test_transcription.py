import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_transcribe_single_file():
    """Verify transcribe() returns correct shape for a small file."""
    mock_segment = MagicMock()
    mock_segment.text = " Hello world"
    mock_segment.start = 0.0
    mock_segment.end = 2.5
    mock_segment.avg_logprob = -0.5

    mock_transcript = MagicMock()
    mock_transcript.text = "Hello world"
    mock_transcript.segments = [mock_segment]

    with patch("app.services.transcription.storage_service") as mock_storage, \
         patch("app.services.transcription.client") as mock_client, \
         patch("app.services.transcription.asyncio.to_thread", new_callable=AsyncMock) as mock_thread, \
         patch("os.path.getsize", return_value=1_000_000):

        mock_storage.download = AsyncMock()
        mock_thread.return_value = None
        mock_client.audio.transcriptions.create = AsyncMock(return_value=mock_transcript)

        from app.services.transcription import transcribe
        result = await transcribe("projects/1/meeting.mp4")

    assert result["full_text"] == "Hello world"
    assert len(result["segments"]) == 1
    assert result["segments"][0]["start"] == 0.0
    assert result["segments"][0]["low_confidence"] is False


@pytest.mark.asyncio
async def test_transcribe_low_confidence_flag():
    """Segments with avg_logprob < -1.0 should be flagged low_confidence=True."""
    mock_segment = MagicMock()
    mock_segment.text = " Unclear speech"
    mock_segment.start = 5.0
    mock_segment.end = 8.0
    mock_segment.avg_logprob = -1.5

    mock_transcript = MagicMock()
    mock_transcript.text = "Unclear speech"
    mock_transcript.segments = [mock_segment]

    with patch("app.services.transcription.storage_service") as mock_storage, \
         patch("app.services.transcription.client") as mock_client, \
         patch("app.services.transcription.asyncio.to_thread", new_callable=AsyncMock), \
         patch("os.path.getsize", return_value=1_000_000):

        mock_storage.download = AsyncMock()
        mock_client.audio.transcriptions.create = AsyncMock(return_value=mock_transcript)

        from app.services.transcription import transcribe
        result = await transcribe("projects/1/noisy.mp4")

    assert result["segments"][0]["low_confidence"] is True


@pytest.mark.asyncio
async def test_transcribe_large_file_chunks():
    """Files > 24 MB should be split and timestamps offset correctly."""
    mock_seg_1 = MagicMock(text=" First chunk",  start=0.0,   end=5.0, avg_logprob=-0.3)
    mock_seg_2 = MagicMock(text=" Second chunk", start=0.0,   end=5.0, avg_logprob=-0.3)
    mock_t1 = MagicMock(text="First chunk",  segments=[mock_seg_1])
    mock_t2 = MagicMock(text="Second chunk", segments=[mock_seg_2])

    call_count = 0

    async def mock_create(**kwargs):
        nonlocal call_count
        call_count += 1
        return mock_t1 if call_count == 1 else mock_t2

    chunks_returned = [("/tmp/audio_000000.mp3", 0.0), ("/tmp/audio_000600.mp3", 600.0)]

    with patch("app.services.transcription.storage_service") as mock_storage, \
         patch("app.services.transcription.client") as mock_client, \
         patch("app.services.transcription.asyncio.to_thread", new_callable=AsyncMock) as mock_thread, \
         patch("os.path.getsize", return_value=30_000_000):

        mock_storage.download = AsyncMock()
        mock_thread.side_effect = [None, chunks_returned]
        mock_client.audio.transcriptions.create = mock_create

        from app.services.transcription import transcribe
        result = await transcribe("projects/1/long_meeting.mp4")

    assert "First chunk" in result["full_text"]
    assert "Second chunk" in result["full_text"]
    seg2 = result["segments"][1]
    assert seg2["start"] == 600.0
    assert seg2["end"] == 605.0
