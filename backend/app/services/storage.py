import asyncio
import logging

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BASE_DELAY = 1  # seconds; doubles each attempt


class StorageError(Exception):
    """Raised when a storage operation fails after retries."""


class StorageService:
    """MinIO storage via the official minio SDK.

    MINIO_ENDPOINT has no http:// prefix - the SDK manages the scheme via
    the `secure` flag, read from settings.MINIO_USE_SSL.

    Single bucket (settings.MINIO_BUCKET) holds both raw client uploads and
    generated PRD exports. If you later want different lifecycle rules per
    file type (e.g. auto-delete raw recordings after 30 days but keep PRD
    exports indefinitely), prefix keys by purpose (e.g. "raw/<project_id>/..."
    vs "exports/<project_id>/...") and apply MinIO bucket lifecycle rules
    scoped to that prefix - no code change needed here for that later.
    """

    def __init__(self) -> None:
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
        self.bucket = settings.MINIO_BUCKET
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            logger.info("Bucket %s not found, creating it", self.bucket)
            self.client.make_bucket(self.bucket)

    async def _with_retry(self, fn, *args, context: str, **kwargs):
        """Run a sync MinIO SDK call in a thread, retrying on transient S3Error."""
        last_error: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                return await asyncio.to_thread(fn, *args, **kwargs)
            except S3Error as exc:
                last_error = exc
                logger.warning(
                    "%s failed (attempt %d/%d): %s", context, attempt, MAX_RETRIES, exc
                )
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BASE_DELAY * (2 ** (attempt - 1)))
        raise StorageError(f"{context} failed after {MAX_RETRIES} attempts: {last_error}") from last_error

    async def upload_stream(
        self,
        key: str,
        file_obj,
        length: int,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        Upload a file-like object without loading it fully into memory.

        `file_obj` must be a stream with .read() (e.g. FastAPI's
        UploadFile.file). `length` is required by the MinIO SDK's
        put_object - for FastAPI UploadFile this is available via file.size
        after the file is fully received, or by seeking:
            file_obj.seek(0, 2); length = file_obj.tell(); file_obj.seek(0)
        """
        await self._with_retry(
            self.client.put_object,
            self.bucket, key, file_obj, length,
            content_type=content_type,
            context=f"upload {self.bucket}/{key}",
        )
        return key

    async def upload_bytes(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        Convenience wrapper for small in-memory payloads (e.g. a generated
        PRD export PDF already fully rendered in memory). Do NOT use this
        for large client uploads - use upload_stream instead so a 1GB video
        isn't held entirely in RAM.
        """
        import io
        await self._with_retry(
            self.client.put_object,
            self.bucket, key, io.BytesIO(data), len(data),
            content_type=content_type,
            context=f"upload {self.bucket}/{key}",
        )
        return key

    async def download(self, key: str, dest_path: str) -> None:
        """Stream an object to dest_path (used by transcription to feed ffmpeg)."""

        def _dl() -> None:
            response = None
            try:
                response = self.client.get_object(self.bucket, key)
                with open(dest_path, "wb") as f:
                    for chunk in response.stream(32 * 1024):
                        f.write(chunk)
            finally:
                if response is not None:
                    response.close()
                    response.release_conn()

        await self._with_retry(_dl, context=f"download {self.bucket}/{key}")

    async def download_bytes(self, key: str) -> bytes:
        """Download an object and return its full content as bytes (for small docs)."""

        def _dl() -> bytes:
            response = None
            try:
                response = self.client.get_object(self.bucket, key)
                return response.read()
            finally:
                if response is not None:
                    response.close()
                    response.release_conn()

        return await self._with_retry(_dl, context=f"download_bytes {self.bucket}/{key}")

    async def delete(self, key: str) -> None:
        await self._with_retry(
            self.client.remove_object, self.bucket, key,
            context=f"delete {self.bucket}/{key}",
        )

    def get_presigned_url(self, key: str, expires_seconds: int = 3600):
        """
        Generates a temporary URL the client portal can use to view/download
        a source file or PRD export directly from MinIO, without proxying
        bytes through the FastAPI process.
        """
        from datetime import timedelta
        return self.client.presigned_get_object(self.bucket, key, expires=timedelta(seconds=expires_seconds))


storage_service = StorageService()