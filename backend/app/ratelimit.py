"""Простой in-memory ограничитель неудачных попыток входа.

Приложение работает в одном процессе (SQLite, один воркер uvicorn), поэтому
хранить счётчики в памяти достаточно. После рестарта они обнуляются.
"""
import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

_MAX_KEYS = 50_000


class FailureLimiter:
    def __init__(self, max_failures: int, window_seconds: int) -> None:
        self.max_failures = max_failures
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float] | None:
        q = self._hits.get(key)
        if q is None:
            return None
        while q and q[0] <= now - self.window:
            q.popleft()
        if not q:
            del self._hits[key]
            return None
        return q

    def check(self, *keys: str) -> None:
        """Бросает 429, если хоть по одному ключу исчерпан лимит неудачных попыток."""
        now = time.monotonic()
        with self._lock:
            for key in keys:
                q = self._recent(key, now)
                if q is not None and len(q) >= self.max_failures:
                    retry = max(1, math.ceil(q[0] + self.window - now))
                    raise HTTPException(
                        429,
                        f"Слишком много неудачных попыток. Попробуйте через {math.ceil(retry / 60)} мин.",
                        headers={"Retry-After": str(retry)},
                    )

    def fail(self, *keys: str) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._hits) > _MAX_KEYS:
                for k in list(self._hits):
                    self._recent(k, now)
                if len(self._hits) > _MAX_KEYS:
                    self._hits.clear()
            for key in keys:
                self._hits.setdefault(key, deque()).append(now)

    def reset(self, *keys: str) -> None:
        with self._lock:
            for key in keys:
                self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


WINDOW = 15 * 60
# По IP — защита от перебора с одного адреса; по аккаунту — от распределённого перебора одного пароля.
login_ip = FailureLimiter(max_failures=30, window_seconds=WINDOW)
login_account = FailureLimiter(max_failures=10, window_seconds=WINDOW)
register_code = FailureLimiter(max_failures=10, window_seconds=WINDOW)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
