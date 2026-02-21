/**
 * SolarTick backend API (Postgres/RWA).
 * Base URL: NEXT_PUBLIC_SOLARTICK_API_URL (e.g. http://localhost:8000)
 */

function getBase(): string {
  if (typeof window !== "undefined")
    return process.env.NEXT_PUBLIC_SOLARTICK_API_URL ?? window.location.origin;
  return process.env.NEXT_PUBLIC_SOLARTICK_API_URL ?? "";
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const base = getBase().replace(/\/$/, "");
  const pathStr = path.startsWith("/") ? path : `/${path}`;
  const search = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : "";
  if (!base) return pathStr + search;
  const u = new URL(pathStr + search, base);
  return u.toString();
}

export type RwaDataPoint = { ts: string; kwh: number; price_cents: number };

export type RwaListItem = {
  rwa_adi_id: number;
  latest_kwh: number | null;
  latest_ts: string | null;
  asset_id?: number | null;
  bootstrap_status?: string | null;
  lock_tx_hash?: string | null;
  beneficiary_address?: string | null;
};

export type RwaFeedEntry = {
  id: number;
  rwa_adi_id: number;
  price_cents: number;
  kwh: number;
  tx_hash: string | null;
  log_index: number | null;
  ts: string;
  source: string;
};

/** Create RWA. Returns rwa_adi_id (use as site_id on chain). */
export async function createRwa(kwh: number): Promise<{ rwa_adi_id: number }> {
  const r = await fetch(buildUrl("/api/rwa"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kwh }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Time-series for an RWA (for pricing chart). */
export async function getRwaData(
  rwaId: number,
  from: string,
  to: string,
  limit = 10000
): Promise<RwaDataPoint[]> {
  const r = await fetch(
    buildUrl(`/api/rwa/${rwaId}/data`, { from, to, limit })
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Latest KWH/price for an RWA. */
export async function getRwaLatest(
  rwaId: number
): Promise<{ ts: string; kwh: number; price_cents: number }> {
  const r = await fetch(buildUrl(`/api/rwa/${rwaId}/latest`));
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** List RWAs (for asset list and publisher). */
export async function listRwas(): Promise<RwaListItem[]> {
  const r = await fetch(buildUrl("/api/rwas"));
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Latest oracle/yield updates (for immutable stream). */
export async function getRwaFeed(limit = 40): Promise<RwaFeedEntry[]> {
  const r = await fetch(buildUrl("/api/rwa/feed", { limit: String(limit) }));
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Current asset price in cents (site_id can be legacy site or rwa_adi_id). */
export async function getPrice(siteId: number): Promise<{
  site_id: number;
  asset_price_cents: number | null;
}> {
  const r = await fetch(buildUrl("/api/price", { site_id: String(siteId) }));
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Check if SolarTick backend (Postgres) is reachable. Used to show "Live" vs "Mock" in UI. */
export async function checkBackendHealth(): Promise<{ ok: boolean; db?: string }> {
  try {
    const r = await fetch(buildUrl("/health"));
    if (!r.ok) return { ok: false };
    const data = await r.json();
    return { ok: true, db: data?.db };
  } catch {
    return { ok: false };
  }
}
