import { TRADING_API_KEY } from "./config";
import type { TradingApiError } from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(message: string, status: number, code = "API_ERROR", details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface Envelope {
  ok?: boolean;
  error?: TradingApiError;
  [key: string]: unknown;
}

function toUrl(base: string, path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(path, base || window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function requestJson<T>(
  base: string,
  path: string,
  init?: RequestInit & { withApiKey?: boolean; params?: Record<string, string | number | undefined> },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (init?.withApiKey && TRADING_API_KEY) {
    headers["x-api-key"] = TRADING_API_KEY;
  }

  const response = await fetch(toUrl(base, path, init?.params), {
    ...init,
    headers,
  });

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    if (body && typeof body === "object" && "error" in body) {
      const { error } = body as Envelope;
      throw new ApiError(error?.message || "Request failed", response.status, error?.code, error?.details);
    }
    throw new ApiError(typeof body === "string" ? body : "Request failed", response.status);
  }

  if (body && typeof body === "object" && "ok" in body) {
    const envelope = body as Envelope;
    if (!envelope.ok) {
      throw new ApiError(
        envelope.error?.message || "Request failed",
        response.status,
        envelope.error?.code,
        envelope.error?.details,
      );
    }
    const rest = { ...envelope };
    delete rest.ok;
    return rest as T;
  }

  return body as T;
}

export function openEventStream(base: string, path: string, params?: Record<string, string | number | undefined>) {
  return new EventSource(toUrl(base, path, params));
}
