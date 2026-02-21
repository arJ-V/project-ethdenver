export type StatusLabel = "created" | "pending" | "executed" | "failed" | "liquidated" | "unknown";

export interface TelemetryPoint {
  site_id: number;
  ts: string;
  watt_hours: number;
  battery_soc: number | null;
  tx_hash: string;
  block_number: number;
  log_index: number;
}

export interface PricePoint {
  ts: string;
  price: number;
}

export interface TradingApiError {
  code: string;
  message: string;
  details: unknown;
}

export interface WriteOptionRequest {
  buyer: string;
  amount: string;
  strike: string;
  expiry: string;
}

export interface WriteOptionResponse {
  txHash: string;
  optionId: string;
  status: StatusLabel;
}

export interface OrderSnapshot {
  optionId: string;
  writer: string;
  buyer: string;
  amount: string;
  strike: string;
  expiry: string;
  scheduleRef: string;
  statusCode: number;
  statusLabel: StatusLabel;
}

export interface TimelineEvent {
  key?: string;
  optionId?: string;
  type: string;
  label?: string;
  status?: StatusLabel;
  chain?: string;
  txHash?: string;
  blockNumber?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export interface OrderWithTimeline {
  order: OrderSnapshot;
  timeline: TimelineEvent[];
}

export interface OrderListResponse {
  orders: OrderSnapshot[];
  count: number;
}
