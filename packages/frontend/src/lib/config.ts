export const TELEMETRY_API_BASE_URL =
  import.meta.env.VITE_TELEMETRY_API_BASE_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8000";
export const TRADING_API_BASE_URL =
  import.meta.env.VITE_TRADING_API_BASE_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:3001";
export const TRADING_API_KEY = import.meta.env.VITE_TRADING_API_KEY ?? "";
