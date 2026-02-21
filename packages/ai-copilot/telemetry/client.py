"""
QuickNode/SolarTick telemetry client.
Fetches solar telemetry from the SolarTick backend (GET /api/history) for agent context.
When telemetry_points is empty, falls back to RWA data (GET /api/rwas) so the agent
can still reference Postgres-backed RWA prices and yield (rwa_timeseries).
When SOLARTICK_API_BASE_URL is not set, all functions return empty/None and the agent works without telemetry.
"""
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import httpx

_log = logging.getLogger(__name__)

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


def _get_json(url: str) -> Optional[dict[str, Any]]:
    """GET JSON; returns dict or None on error."""
    if not BASE_URL:
        return None
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            r = client.get(url)
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, dict) else None
    except Exception:
        return None


def fetch_price(site_id: int = SITE_ID) -> Optional[dict[str, Any]]:
    """
    Fetch current RWA asset price from SolarTick backend.
    GET /api/price?site_id= → { "site_id", "asset_price_cents" } (cents integer, or null).
    """
    if not BASE_URL:
        return None
    url = f"{BASE_URL}/api/price?site_id={site_id}"
    return _get_json(url)


def fetch_rwas() -> list[dict[str, Any]]:
    """
    Fetch list of RWAs with latest KWH and price from SolarTick backend.
    GET /api/rwas → list of { rwa_adi_id, latest_kwh, latest_ts, latest_price_cents, ... }.
    Used when telemetry_points is empty (RWA-only data in Postgres).
    """
    if not BASE_URL:
        return []
    url = f"{BASE_URL}/api/rwas"
    result = _get(url)
    return result if isinstance(result, list) else []


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


def _build_context_from_rwas(rwas: list[dict[str, Any]], site_id: int) -> str:
    """Build telemetry context string from RWA list (rwa_timeseries data) when telemetry_points is empty."""
    if not rwas:
        return ""
    lines = [
        "--- SolarTick RWA data (Postgres / rwa_timeseries backing ySOLAR) ---",
        f"Site/RWA ID used for price: {site_id}. RWAs below are from GET /api/rwas (latest KWH and price from Postgres).",
    ]
    for r in rwas:
        rwa_id = r.get("rwa_adi_id") or r.get("rwa_id")
        latest_kwh = r.get("latest_kwh")
        latest_ts = r.get("latest_ts") or "N/A"
        latest_cents = r.get("latest_price_cents")
        price_str = f"{latest_cents} cents (${latest_cents / 100:.2f})" if latest_cents is not None else "N/A"
        lines.append(f"RWA id={rwa_id}: latest_ts={latest_ts}, latest_kwh={latest_kwh}, latest_price_cents={price_str}.")
    # Ensure agent has current price for default site_id (e.g. 1)
    price_data = fetch_price(site_id=site_id)
    if price_data is not None and price_data.get("asset_price_cents") is not None:
        cents = int(price_data["asset_price_cents"])
        lines.append(f"Current RWA asset price (site_id={site_id}): {cents} cents (${cents / 100:.2f}).")
    else:
        lines.append(f"Current RWA asset price (site_id={site_id}): not available.")
    lines.extend([
        "Use this data when discussing yield trends, covered calls, current grid performance, or pricing.",
        "---",
    ])
    return "\n".join(lines)


def get_telemetry_context(
    site_id: int = SITE_ID,
    hours: int = 24,
    include_latest: bool = True,
    max_points_for_summary: int = 100,
) -> str:
    """
    Build a short text summary of telemetry for the LLM (ASK/TRADE context).
    Uses GET /api/history (telemetry_points) when available; when that is empty,
    falls back to GET /api/rwas (rwa_timeseries) so the agent can still reference Postgres RWA data.
    Returns empty string if backend is unavailable or no data at all.
    """
    if not BASE_URL:
        _log.debug("SOLARTICK_API_BASE_URL not set; agent has no SolarTick/Postgres context.")
        return ""

    to_ts = datetime.now(timezone.utc)
    from_ts = to_ts - timedelta(hours=hours)
    points = fetch_history(site_id=site_id, from_ts=from_ts, to_ts=to_ts, limit=max_points_for_summary)

    if points:
        # Latest reading from telemetry_points
        latest = points[-1]
        latest_ts = latest.get("ts", "")
        latest_wh = latest.get("watt_hours", 0)
        latest_soc = latest.get("battery_soc")
        if latest_soc is None:
            soc_pct = "N/A"
        elif isinstance(latest_soc, (int, float)) and latest_soc <= 1:
            soc_pct = f"{latest_soc * 100:.1f}%"
        else:
            soc_pct = f"{latest_soc:.1f}%"

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
        ]
        price_data = fetch_price(site_id=site_id)
        if price_data is not None and price_data.get("asset_price_cents") is not None:
            cents = int(price_data["asset_price_cents"])
            lines.append(f"Current RWA asset price (site {site_id}): {cents} cents (${cents / 100:.2f}).")
        else:
            lines.append(f"Current RWA asset price (site {site_id}): not available.")
        lines.extend([
            "Use this data when discussing yield trends, covered calls, current grid performance, or pricing.",
            "---",
        ])
        return "\n".join(lines)

    # No telemetry_points data: fall back to RWA list (rwa_timeseries in Postgres)
    rwas = fetch_rwas()
    if rwas:
        _log.info("No telemetry_points for site_id=%s; using RWA data (%d RWAs) for agent context.", site_id, len(rwas))
        return _build_context_from_rwas(rwas, site_id)

    _log.warning(
        "SolarTick backend reachable but no data: /api/history returned 0 points and /api/rwas returned 0 RWAs. "
        "Ensure Postgres has data (telemetry_points or rwa_timeseries)."
    )
    return ""
