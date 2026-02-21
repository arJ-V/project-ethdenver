import { TRADING_API_BASE_URL } from "./config";
import { requestJson } from "./http";
import type {
  OrderListResponse,
  OrderWithTimeline,
  StatusLabel,
  TimelineEvent,
  WriteOptionRequest,
  WriteOptionResponse,
} from "./types";

export async function writeOption(payload: WriteOptionRequest) {
  return requestJson<WriteOptionResponse>(TRADING_API_BASE_URL, "/write-option", {
    method: "POST",
    body: JSON.stringify(payload),
    withApiKey: true,
  });
}

export async function fetchOrder(optionId: string) {
  return requestJson<OrderWithTimeline>(TRADING_API_BASE_URL, `/orders/${optionId}`, {
    method: "GET",
  });
}

export async function fetchOrders(filters?: { writer?: string; buyer?: string; status?: StatusLabel }) {
  return requestJson<OrderListResponse>(TRADING_API_BASE_URL, "/orders", {
    method: "GET",
    params: {
      writer: filters?.writer,
      buyer: filters?.buyer,
      status: filters?.status,
    },
  });
}

export async function fetchTimeline(optionId: string) {
  return requestJson<{ optionId: string; events: TimelineEvent[] }>(
    TRADING_API_BASE_URL,
    `/timeline/${optionId}`,
    {
      method: "GET",
    },
  );
}

export async function fetchTradingHealth() {
  return requestJson<{
    service: string;
    chainId: number | null;
    indexer: { lastPollAt?: string; lastPollError?: string | null };
  }>(TRADING_API_BASE_URL, "/health", {
    method: "GET",
  });
}
