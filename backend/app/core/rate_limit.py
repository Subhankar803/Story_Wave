"""Rate limiting for AI endpoints."""
import time
from collections import defaultdict
from fastapi import HTTPException, Request, status
from app.core.config import settings

# In-memory sliding window / bucket tracker: client_id -> list of timestamps
_request_timestamps: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(request: Request, max_requests: int | None = None, window_seconds: int = 60) -> None:
    """Rate limit checker dependency or helper."""
    limit = max_requests or settings.RATE_LIMIT_PER_MINUTE
    client_ip = request.client.host if request.client else "unknown"

    # Also check Authorization header if present to rate limit by user
    auth_header = request.headers.get("Authorization", "")
    key = f"{client_ip}:{auth_header[:30]}" if auth_header else client_ip

    now = time.time()
    cutoff = now - window_seconds

    # Filter timestamps older than the window
    timestamps = [ts for ts in _request_timestamps[key] if ts > cutoff]
    if len(timestamps) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Maximum {limit} requests per {window_seconds} seconds.",
        )

    timestamps.append(now)
    _request_timestamps[key] = timestamps
