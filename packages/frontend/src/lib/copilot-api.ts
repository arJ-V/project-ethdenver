/**
 * AI Copilot backend (Ask / Trade modes, intents).
 * Base URL: NEXT_PUBLIC_COPILOT_API_URL (e.g. http://localhost:8003)
 */

export function getCopilotBaseUrl(): string {
  if (typeof window !== "undefined")
    return process.env.NEXT_PUBLIC_COPILOT_API_URL ?? window.location.origin;
  return process.env.NEXT_PUBLIC_COPILOT_API_URL ?? "";
}

function getBase(): string {
  return getCopilotBaseUrl();
}

function buildUrl(path: string): string {
  const base = getBase().replace(/\/$/, "");
  const pathStr = path.startsWith("/") ? path : `/${path}`;
  if (!base) return pathStr;
  return new URL(pathStr, base).toString();
}

export type CopilotMode = "ask" | "trade";

export type ChatResponse = {
  session_id: string;
  mode: CopilotMode;
  content: string;
  intent?: TradeIntentResponse | null;
};

export type TradeIntentResponse = {
  intent_id: string;
  writer: string;
  buyer: string;
  product: string;
  underlying: string;
  amount: number;
  strike: number;
  expiry: number;
  status: string;
  tx_hash?: string | null;
  option_id?: string | null;
};

/** Send a chat message; mode switches between Ask (analyze) and Trade (trading agent). */
export async function chat(
  sessionId: string,
  message: string,
  mode: CopilotMode
): Promise<ChatResponse> {
  const r = await fetch(buildUrl("/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message, mode }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Save an intent (from trade mode response). */
export async function createIntent(intent: TradeIntentResponse): Promise<TradeIntentResponse> {
  const r = await fetch(buildUrl("/intents"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Get intent status (tx_hash, option_id after submit). */
export async function getIntent(intentId: string): Promise<TradeIntentResponse> {
  const r = await fetch(buildUrl(`/intents/${intentId}`));
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Submit intent to trading-api → Hedera writeOption. */
export async function submitIntent(intentId: string): Promise<TradeIntentResponse> {
  const r = await fetch(buildUrl(`/intents/${intentId}/submit`), { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Check if AI Copilot backend is reachable. */
export async function checkCopilotHealth(): Promise<boolean> {
  try {
    const r = await fetch(buildUrl("/health"));
    return r.ok;
  } catch {
    return false;
  }
}
