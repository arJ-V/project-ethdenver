/**
 * Trading API (orders, timeline). Base URL: NEXT_PUBLIC_TRADING_API_URL (e.g. http://localhost:3001)
 */

declare const process: { env: Record<string, string | undefined> };

function getBase(): string {
  if (typeof window !== "undefined")
    return process.env.NEXT_PUBLIC_TRADING_API_URL ?? window.location.origin;
  return process.env.NEXT_PUBLIC_TRADING_API_URL ?? "";
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

export type Order = {
  optionId: string;
  writer: string;
  buyer: string;
  amount: string;
  strike: string;
  expiry: string;
  statusCode?: number;
  statusLabel: string;
  lastEvent?: string;
  updatedAt?: string;
};

export type TimelineEvent = {
  eventKey?: string;
  source?: string;
  event: string;
  optionId?: string | null;
  txHash?: string | null;
  blockNumber?: number;
  logIndex?: number;
  ts?: string | null;
  statusLabel?: string | null;
};

export type GetOrdersResult = {
  ok: true;
  orders: Order[];
  count: number;
};

export type GetTimelineResult = {
  ok: true;
  optionId: string;
  events: TimelineEvent[];
};

export type TradingHealthResult = {
  ok: true;
  service: string;
  chainId?: number | null;
  indexer?: { lastPollAt?: string | null; lastPollError?: string | null };
};

/** List orders with optional writer, buyer, status filters. */
export async function getOrders(params?: {
  writer?: string;
  buyer?: string;
  status?: string;
}): Promise<GetOrdersResult> {
  const search: Record<string, string | undefined> = {};
  if (params?.writer) search.writer = params.writer;
  if (params?.buyer) search.buyer = params.buyer;
  if (params?.status) search.status = params.status;
  const r = await fetch(buildUrl("/orders", search));
  if (!r.ok) {
    const body = await r.text();
    throw new Error(body || `GET /orders failed: ${r.status}`);
  }
  const data = await r.json();
  if (!data.ok) throw new Error(data?.error?.message || "GET /orders failed");
  return { ok: true, orders: data.orders ?? [], count: data.count ?? 0 };
}

/** Timeline events for one option. */
export async function getTimeline(optionId: string): Promise<GetTimelineResult> {
  const r = await fetch(buildUrl(`/timeline/${encodeURIComponent(optionId)}`));
  if (!r.ok) {
    const body = await r.text();
    throw new Error(body || `GET /timeline/${optionId} failed: ${r.status}`);
  }
  const data = await r.json();
  if (!data.ok) throw new Error(data?.error?.message || "GET /timeline failed");
  return {
    ok: true,
    optionId: String(data.optionId ?? optionId),
    events: data.events ?? [],
  };
}

/** Trading API health (service, chainId, indexer meta). */
export async function getTradingHealth(): Promise<TradingHealthResult | { ok: false }> {
  try {
    const r = await fetch(buildUrl("/health"));
    if (!r.ok) return { ok: false };
    const data = await r.json();
    return { ok: true, ...data };
  } catch {
    return { ok: false };
  }
}
