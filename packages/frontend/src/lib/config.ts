const FALLBACK_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? FALLBACK_ORIGIN;

export const TELEMETRY_API_BASE_URL = import.meta.env.VITE_TELEMETRY_API_BASE_URL ?? API_BASE_URL;
export const TRADING_API_BASE_URL = import.meta.env.VITE_TRADING_API_BASE_URL ?? API_BASE_URL;
export const TRADING_API_KEY = import.meta.env.VITE_TRADING_API_KEY ?? "";
