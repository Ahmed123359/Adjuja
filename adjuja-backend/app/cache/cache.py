import hashlib
import json
import logging
from functools import lru_cache
from typing import Any

logger = logging.getLogger(__name__)

_redis = None


@lru_cache(maxsize=1)
def _client():
    from app.config.settings import get_settings
    url = get_settings().redis_url
    if not url:
        return None
    try:
        import redis
        r = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        r.ping()
        logger.info("Redis connected: %s", url)
        return r
    except Exception as e:
        logger.warning("Redis unavailable (%s)  cache disabled", e)
        return None


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get(key: str) -> Any | None:
    r = _client()
    if not r:
        return None
    try:
        raw = r.get(key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.warning("Cache get error: %s", e)
        return None


def set(key: str, value: Any, ttl: int = 86400) -> None:
    r = _client()
    if not r:
        return
    try:
        r.setex(key, ttl, json.dumps(value, ensure_ascii=False))
    except Exception as e:
        logger.warning("Cache set error: %s", e)


def delete(key: str) -> None:
    r = _client()
    if not r:
        return
    try:
        r.delete(key)
    except Exception as e:
        logger.warning("Cache delete error: %s", e)


def exists(key: str) -> bool:
    r = _client()
    if not r:
        return False
    try:
        return bool(r.exists(key))
    except Exception:
        return False
