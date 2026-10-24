"""In-process sliding-window rate limiter.

Prototype-only. The architecture explicitly defers Redis, so a single-process
limiter is the honest choice here: it protects a single instance and resets on
restart. Replace with a shared store before running more than one replica.
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock

from app.core.config import settings


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def check(self, bucket: str, key: str, *, limit: int, window_seconds: int) -> bool:
        """Record a hit. Returns False when the limit is exceeded."""
        if not settings.rate_limit_enabled:
            return True

        composite = f"{bucket}:{key}"
        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            hits = self._hits.setdefault(composite, deque())
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True

    def reset(self, bucket: str, key: str) -> None:
        with self._lock:
            self._hits.pop(f"{bucket}:{key}", None)


limiter = RateLimiter()
