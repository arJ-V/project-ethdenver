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
  /** Latest price in cents from rwa_timeseries (Postgres). Use for preview. */
  latest_price_cents?: number | null;
  asset_id?: number | null;
  bootstrap_status?: string | null;
  mint_tx_hash?: string | null;
  lock_tx_hash?: string | null;
  hedera_mint_tx_hash?: string | null;
  hedera_mint_status?: string | null;
  beneficiary_address?: string | null;
};

export type PublicConfig = {
  adi_vault_address: string | null;
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

/** Public config (e.g. ADI Vault address for display). */
export async function getConfig(): Promise<PublicConfig> {
  const r = await fetch(buildUrl("/api/config"));
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Create RWA. When bootstrap !== false (default), runs ADI mint+lock and returns asset_id + tx hashes. */
export async function createRwa(
  kwh: number,
  options?: { bootstrap?: boolean; beneficiary?: string }
): Promise<{
  rwa_adi_id: number;
  asset_id?: number;
  beneficiary?: string;
  mint_tx_hash?: string;
  lock_tx_hash?: string;
  status?: string;
}> {
  const bootstrap = options?.bootstrap !== false;
  const body: { kwh: number; bootstrap?: boolean; beneficiary?: string } = { kwh };
  if (bootstrap) body.bootstrap = true;
  if (options?.beneficiary) body.beneficiary = options.beneficiary;
  const r = await fetch(buildUrl("/api/rwa"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Create RWA and bootstrap on ADI (mint + lock). Returns rwa_adi_id, asset_id, tx hashes. */
export async function bootstrapRwa(
  kwh: number,
  beneficiary?: string
): Promise<{
  rwa_adi_id: number;
  asset_id?: number;
  beneficiary: string;
  mint_tx_hash: string;
  lock_tx_hash: string;
  status: string;
}> {
  const r = await fetch(buildUrl("/api/rwa/bootstrap"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kwh, beneficiary: beneficiary || undefined }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Bootstrap an existing RWA (status=created) on ADI so ADI/Hedera fields populate. */
export async function bootstrapRwaById(
  rwaId: number,
  beneficiary?: string
): Promise<{
  rwa_adi_id: number;
  asset_id?: number;
  beneficiary: string;
  mint_tx_hash: string;
  lock_tx_hash: string;
  status: string;
}> {
  const r = await fetch(buildUrl(`/api/rwa/${rwaId}/bootstrap`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(beneficiary != null ? { beneficiary } : {}),
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
