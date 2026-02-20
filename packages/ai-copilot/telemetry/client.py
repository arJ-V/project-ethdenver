"""
QuickNode/SolarTick telemetry client.
Fetches solar telemetry from the SolarTick backend (GET /api/history) for agent context.
When SOLARTICK_API_BASE_URL is not set, all functions return empty/None and the agent works without telemetry.
"""
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import httpx

BASE_URL = os.environ.get("SOLARTICK_API_BASE_URL", "").rstrip("/")
SITE_ID = int(os.environ.get("SOLARTICK_SITE_ID", "1"))
TIMEOUT = 15.0
MAX_POINTS = 5000


def _get(url: str) -> Optional[list[dict[str, Any]]]:
    """GET JSON; returns list of telemetry points or None on error."""
    if not BASE_URL:
        return None
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            r = client.get(url)
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else None
    except Exception:
        return None


def fetch_history(
    site_id: int = SITE_ID,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
    limit: int = MAX_POINTS,
) -> list[dict[str, Any]]:
    """
    Fetch historical telemetry from SolarTick backend.
    GET /api/history?site_id=&from=<ISO>&to=<ISO>&limit=
    """
    if not BASE_URL:
        return []
    to_ts = to_ts or datetime.now(timezone.utc)
    from_ts = from_ts or (to_ts - timedelta(hours=24))
    from_iso = from_ts.isoformat().replace("+00:00", "Z")
    to_iso = to_ts.isoformat().replace("+00:00", "Z")
    url = f"{BASE_URL}/api/history?site_id={site_id}&from={from_iso}&to={to_iso}&limit={limit}"
    result = _get(url)
    return result if result is not None else []


def fetch_latest(site_id: int = SITE_ID) -> Optional[dict[str, Any]]:
    """
    Fetch the most recent telemetry point (last ~10 minutes window, take last).
    """
    to_ts = datetime.now(timezone.utc)
    from_ts = to_ts - timedelta(minutes=10)
    points = fetch_history(site_id=site_id, from_ts=from_ts, to_ts=to_ts, limit=10)
    if not points:
        return None
    # API returns ASC by ts; last element is latest
    return points[-1]


def get_telemetry_context(
    site_id: int = SITE_ID,
    hours: int = 24,
    include_latest: bool = True,
    max_points_for_summary: int = 100,
) -> str:
    """
    Build a short text summary of telemetry for the LLM (ASK/TRADE context).
    Returns empty string if backend is unavailable or no data.
    """
    if not BASE_URL:
        return ""

    to_ts = datetime.now(timezone.utc)
    from_ts = to_ts - timedelta(hours=hours)
    points = fetch_history(site_id=site_id, from_ts=from_ts, to_ts=to_ts, limit=max_points_for_summary)

    if not points:
        return ""

    # Latest reading
    latest = points[-1] if points else None
    latest_ts = latest.get("ts", "")
    latest_wh = latest.get("watt_hours", 0)
    latest_soc = latest.get("battery_soc")
    if latest_soc is None:
        soc_pct = "N/A"
    elif isinstance(latest_soc, (int, float)) and latest_soc <= 1:
        soc_pct = f"{latest_soc * 100:.1f}%"
    else:
        soc_pct = f"{latest_soc:.1f}%"

    # Simple stats over window
    watt_hours_list = [p.get("watt_hours") for p in points if p.get("watt_hours") is not None]
    soc_list = [p.get("battery_soc") for p in points if p.get("battery_soc") is not None]
    avg_wh = sum(watt_hours_list) / len(watt_hours_list) if watt_hours_list else 0
    avg_soc = sum(soc_list) / len(soc_list) if soc_list else None
    if avg_soc is not None and avg_soc <= 1:
        avg_soc_pct = f"{avg_soc * 100:.1f}%"
    else:
        avg_soc_pct = f"{avg_soc:.1f}%" if avg_soc is not None else "N/A"

    lines = [
        "--- QuickNode / SolarTick telemetry (solar grid backing ySOLAR) ---",
        f"Site ID: {site_id} | Last {hours}h: {len(points)} points.",
        f"Latest reading ({latest_ts}): watt_hours={latest_wh:,}, battery_soc={soc_pct}.",
        f"Period average: watt_hours={avg_wh:,.0f}, battery_soc={avg_soc_pct}.",
        "Use this data when discussing yield trends, covered calls, or current grid performance.",
        "---",
    ]
    return "\n".join(lines)
