"""Spend guard for Claude vision calls (screenshot reads, result reviews, prefill).

The app is public: anyone with a lobby link can upload screenshots, and every read
is billed to the server's API key. These sliding-window caps keep a stuck client,
a looping script, or a link shared too widely from turning into a bill. Normal
play sits far below them (a 4-diver drop is roughly 15-25 calls).

Caps are per process (one instance on Render) and reset on restart. All three are
env-configurable; 0 disables a cap. For a hard ceiling, also set a monthly spend
limit on the API key in the Anthropic Console.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

PER_LOBBY_HOUR = int(os.environ.get("WARMIND_VISION_PER_LOBBY_HOUR", "60"))
PER_IP_HOUR = int(os.environ.get("WARMIND_VISION_PER_IP_HOUR", "40"))
PER_DAY = int(os.environ.get("WARMIND_VISION_PER_DAY", "400"))

_lock = threading.Lock()
_events: dict[str, deque] = defaultdict(deque)   # key -> timestamps of calls


class OverBudget(Exception):
    """Raised when a vision call would exceed a cap; the message is user-facing."""


def _count(key: str, window: float, now: float) -> int:
    q = _events[key]
    while q and q[0] <= now - window:
        q.popleft()
    return len(q)


def charge(lobby_id: str, ip: str, calls: int) -> None:
    """Reserve `calls` vision calls for this lobby + IP, or raise OverBudget."""
    now = time.time()
    with _lock:
        checks = [(f"lobby:{lobby_id}", 3600, PER_LOBBY_HOUR, "this war table"),
                  (f"ip:{ip}", 3600, PER_IP_HOUR, "your connection"),
                  ("all", 86400, PER_DAY, "WARMIND today")]
        for key, window, cap, who in checks:
            if cap and _count(key, window, now) + calls > cap:
                raise OverBudget(f"Screenshot reads are cooling down for {who} (too many in a short time). "
                                 "Try again later.")
        for key, _, _, _ in checks:
            _events[key].extend([now] * calls)


def status() -> dict:
    now = time.time()
    with _lock:
        return {"calls_today": _count("all", 86400, now), "per_day_cap": PER_DAY,
                "per_lobby_hour_cap": PER_LOBBY_HOUR, "per_ip_hour_cap": PER_IP_HOUR}
