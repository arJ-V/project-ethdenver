import { TELEMETRY_API_BASE_URL } from "./config";
import { requestJson } from "./http";

export interface RwaListItem {
  rwa_adi_id: number;
  latest_kwh: number | null;
  latest_ts: string | null;
  asset_id: number | null;
  bootstrap_status: string | null;
  lock_tx_hash: string | null;
  beneficiary_address: string | null;
}

export interface RwaLatestPoint {
  ts: string;
  kwh: number;
  price_cents: number;
}

export interface RwaBootstrapResponse {
  rwa_adi_id: number;
  asset_id: number;
  beneficiary: string;
  mint_tx_hash: string;
  lock_tx_hash: string;
  status: string;
}

export interface RwaFeedItem {
  id: number;
  rwa_adi_id: number;
  price_cents: number;
  kwh: number;
  tx_hash: string | null;
  log_index: number | null;
  ts: string;
  source: "oracle";
}

export async function createRwa(kwh: number) {
  return requestJson<{ rwa_adi_id: number }>(TELEMETRY_API_BASE_URL, "/api/rwa", {
    method: "POST",
    body: JSON.stringify({ kwh }),
  });
}

export async function bootstrapRwa(kwh: number) {
  return requestJson<RwaBootstrapResponse>(TELEMETRY_API_BASE_URL, "/api/rwa/bootstrap", {
    method: "POST",
    body: JSON.stringify({ kwh }),
  });
}

export async function listRwas() {
  return requestJson<RwaListItem[]>(TELEMETRY_API_BASE_URL, "/api/rwas", {
    method: "GET",
  });
}

export async function fetchRwaLatest(rwaId: number) {
  return requestJson<RwaLatestPoint>(TELEMETRY_API_BASE_URL, `/api/rwa/${rwaId}/latest`, {
    method: "GET",
  });
}

export async function fetchRwaHealth() {
  return requestJson<{ status: string; db: string }>(TELEMETRY_API_BASE_URL, "/api/health", {
    method: "GET",
  });
}

export async function fetchRwaFeed(limit = 40) {
  return requestJson<RwaFeedItem[]>(TELEMETRY_API_BASE_URL, "/api/rwa/feed", {
    method: "GET",
    params: { limit },
  });
}
