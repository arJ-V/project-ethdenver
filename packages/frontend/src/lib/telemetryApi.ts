import { TELEMETRY_API_BASE_URL } from "./config";
import { openEventStream, requestJson } from "./http";
import type { PricePoint, TelemetryPoint } from "./types";

export async function fetchTelemetryHistory(params: {
  siteId: number;
  from: string;
  to: string;
  limit?: number;
}) {
  return requestJson<TelemetryPoint[]>(TELEMETRY_API_BASE_URL, "/api/history", {
    method: "GET",
    params: {
      site_id: params.siteId,
      from: params.from,
      to: params.to,
      limit: params.limit,
    },
  });
}

export function createTelemetryLiveStream(siteId: number) {
  return openEventStream(TELEMETRY_API_BASE_URL, "/api/live", { site_id: siteId, last: "true" });
}

export async function fetchPriceHistory(params: {
  assetId: string;
  from: string;
  to: string;
  limit?: number;
}): Promise<PricePoint[]> {
  return requestJson<PricePoint[]>(TELEMETRY_API_BASE_URL, "/api/price-history", {
    method: "GET",
    params: {
      asset_id: params.assetId,
      from: params.from,
      to: params.to,
      limit: params.limit,
    },
  });
}
