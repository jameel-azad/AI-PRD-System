import asyncio
import io

from minio import Minio

from app.core.config import settings


class StorageService:
    """MinIO storage via the official minio SDK.

    MINIO_ENDPOINT has no http:// prefix — the SDK manages the scheme via secure=False/True.
    """

    def __init__(self) -> None:
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
        self.bucket = settings.MINIO_BUCKET
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    async def upload(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object,
            self.bucket, key, io.BytesIO(data), len(data),
            content_type=content_type,
        )

    async def download(self, key: str, dest_path: str) -> None:
        """Download object to dest_path (used by transcription to feed ffmpeg)."""
        def _dl() -> None:
            response = self.client.get_object(self.bucket, key)
            with open(dest_path, "wb") as f:
                for chunk in response.stream(32 * 1024):
                    f.write(chunk)
            response.close()
            response.release_conn()

        await asyncio.to_thread(_dl)


storage_service = StorageService()
