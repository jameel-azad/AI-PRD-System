# Gemini embeddings — commented out, using OpenAI
# import google.generativeai as genai
# genai.configure(api_key=settings.GEMINI_API_KEY)

from openai import AsyncOpenAI

from app.core.config import settings

_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

CHUNK_SIZE    = 1500   # characters
CHUNK_OVERLAP = 200


def chunk_text(text: str) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append(text[start:end])
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def embed_text(text: str) -> list[float]:
    # dimensions=768 matches the pgvector column size (originally sized for Gemini
    # text-embedding-004). text-embedding-3-small supports arbitrary dimension
    # reduction so no DB migration is needed.
    response = await _client.embeddings.create(
        model=settings.OPENAI_EMBEDDING_MODEL,
        input=text,
        dimensions=768,
    )
    return response.data[0].embedding
