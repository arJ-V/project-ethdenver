const BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

export interface TelemetryPoint {
  site_id: number;
  ts: string;
  watt_hours: number;
  battery_soc: number | null;
  tx_hash: string;
  block_number: number;
  log_index: number;
}

export async function fetchHistory(params: {
  site_id: number;
  from: string;
  to: string;
  limit?: number;
}): Promise<TelemetryPoint[]> {
  const u = new URL("/api/history", BASE || window.location.origin);
  u.searchParams.set("site_id", String(params.site_id));
  u.searchParams.set("from", params.from);
  u.searchParams.set("to", params.to);
  if (params.limit != null) u.searchParams.set("limit", String(params.limit));
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function liveEventSource(siteId: number): EventSource {
  const u = new URL("/api/live", BASE || window.location.origin);
  u.searchParams.set("site_id", String(siteId));
  u.searchParams.set("last", "true");
  return new EventSource(u.toString());
}

const DEMO_RESET_ENABLED = import.meta.env?.VITE_DEMO_RESET_ENABLED === "true";
const DEMO_RESET_SECRET = import.meta.env?.VITE_DEMO_RESET_SECRET;

export async function resetForDemo(): Promise<void> {
  if (!DEMO_RESET_ENABLED || !DEMO_RESET_SECRET) throw new Error("Demo reset not enabled");
  const u = new URL("/api/reset", BASE || window.location.origin);
  u.searchParams.set("secret", DEMO_RESET_SECRET);
  const r = await fetch(u.toString(), { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
}

export function isDemoResetEnabled(): boolean {
  return DEMO_RESET_ENABLED && !!DEMO_RESET_SECRET;
}
