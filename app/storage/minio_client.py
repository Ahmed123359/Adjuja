import datetime
import logging
from functools import lru_cache
from io import BytesIO

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> Minio:
    from app.config.settings import get_settings
    s = get_settings()
    return Minio(
        s.minio_endpoint,
        access_key=s.minio_access_key,
        secret_key=s.minio_secret_key,
        secure=s.minio_secure,
    )


def _ensure_bucket(bucket: str) -> None:
    c = _client()
    if not c.bucket_exists(bucket):
        c.make_bucket(bucket)
        logger.info("MinIO bucket created: %s", bucket)


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    from app.config.settings import get_settings
    bucket = get_settings().minio_bucket
    _ensure_bucket(bucket)
    _client().put_object(bucket, key, BytesIO(data), length=len(data), content_type=content_type)
    logger.debug("MinIO upload: %s (%d bytes)", key, len(data))
    return key


def upload_file(key: str, local_path: str, content_type: str = "application/octet-stream") -> str:
    from app.config.settings import get_settings
    bucket = get_settings().minio_bucket
    _ensure_bucket(bucket)
    _client().fput_object(bucket, key, local_path, content_type=content_type)
    logger.debug("MinIO upload file: %s -> %s", local_path, key)
    return key


def presigned_get(key: str) -> str:
    from app.config.settings import get_settings
    s = get_settings()
    url = _client().presigned_get_object(
        s.minio_bucket,
        key,
        expires=datetime.timedelta(seconds=s.minio_presign_expires),
    )
    return url


def delete(key: str) -> None:
    from app.config.settings import get_settings
    try:
        _client().remove_object(get_settings().minio_bucket, key)
    except S3Error as e:
        logger.warning("MinIO delete failed for %s: %s", key, e)


def upload_dedup(data: bytes, prefix: str, content_type: str = "application/octet-stream") -> str:
    """Upload avec deduplication par SHA256. Retourne la cle MinIO (existante ou nouvelle)."""
    from app.cache import cache
    from app.config.settings import get_settings

    file_hash = cache.sha256(data)
    cache_key = f"minio:dedup:{file_hash}"

    existing = cache.get(cache_key)
    if existing:
        logger.debug("MinIO dedup hit: %s -> %s", file_hash[:8], existing)
        return existing

    ext = content_type.split("/")[-1].replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx")
    key = f"{prefix}/{file_hash}.{ext}"
    upload_bytes(key, data, content_type)
    cache.set(cache_key, key, ttl=get_settings().redis_ttl_dedup)
    return key


def get_file_bytes(key: str) -> bytes:
    """Télécharge un objet MinIO et retourne son contenu en bytes."""
    from app.config.settings import get_settings
    response = _client().get_object(get_settings().minio_bucket, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_file(key: str) -> None:
    from app.config.settings import get_settings
    _client().remove_object(get_settings().minio_bucket, key)


def is_ready() -> bool:
    try:
        from app.config.settings import get_settings
        _client().bucket_exists(get_settings().minio_bucket)
        return True
    except Exception:
        return False
