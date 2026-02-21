import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RwaAsset } from "../../data/assets";
import { useDeepDiveSeries } from "../../hooks/useDeepDiveSeries";
import { Layers, Maximize2, RefreshCw, ShieldCheck } from "lucide-react";

interface DeepDiveTelemetryPanelProps {
  asset: RwaAsset;
  onOpenTradeOptions: () => void;
  statusLabel?: string;
}

function toTimeLabel(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DeepDiveTelemetryPanel({ asset, onOpenTradeOptions, statusLabel }: DeepDiveTelemetryPanelProps) {
  const { series, loading, error } = useDeepDiveSeries(asset.id, asset.telemetrySiteId, asset.price);
  const chartData = series.map((point) => ({
    ...point,
    timeLabel: toTimeLabel(point.ts),
  }));

  return (
    <section className="panel trader-panel deepdive-panel">
      <div className="panel-header">
        <div className="deepdive-title-wrap">
          <span className="deepdive-logo">
            <Layers size={14} />
          </span>
          <div>
          <h2 className="panel-title">
            {asset.name} [{asset.symbol}]
          </h2>
            <p className="panel-subtitle">
              <ShieldCheck size={12} /> Verified Node Consensus
            </p>
          </div>
        </div>
        <div className="deepdive-kpi-wrap">
          <p className="panel-kpi">${asset.price.toLocaleString()}</p>
          <p className="asset-change asset-change-up">+{asset.changePct.toFixed(2)}%</p>
        </div>
      </div>

      {error ? <p className="status status-error">Telemetry endpoint unavailable (expected during setup).</p> : null}
      {loading && chartData.length === 0 ? <p className="muted">Loading telemetry streams…</p> : null}

      <div className="deepdive-toolbar">
        <div className="deepdive-range-tabs">
          <button type="button">1m</button>
          <button type="button">5m</button>
          <button type="button" className="active">1h</button>
          <button type="button">1d</button>
        </div>
        <div className="deepdive-actions">
          <button type="button" className="trade-open-button" onClick={onOpenTradeOptions}>
            Trade Options
          </button>
          <button type="button" aria-label="Refresh">
            <RefreshCw size={14} />
          </button>
          <button type="button" aria-label="Expand">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div className="chart-wrap">
        <p className="chart-title">Price Over Time</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(120, 188, 220, 0.7)" />
                <stop offset="100%" stopColor="rgba(120, 188, 220, 0.06)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#233040" />
            <XAxis dataKey="timeLabel" stroke="#9eb0c4" minTickGap={24} />
            <YAxis stroke="#9eb0c4" width={56} />
            <Tooltip contentStyle={{ background: "#121821", border: "1px solid #233040", borderRadius: 10 }} />
            <Area type="monotone" dataKey="price" stroke="#78bcdc" fill="url(#priceGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-wrap">
        <p className="chart-title">Yield Over Time (Watt-hours)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#233040" />
            <XAxis dataKey="timeLabel" stroke="#9eb0c4" minTickGap={24} />
            <YAxis stroke="#9eb0c4" width={56} />
            <Tooltip contentStyle={{ background: "#121821", border: "1px solid #233040", borderRadius: 10 }} />
            <Line type="monotone" dataKey="yieldWh" stroke="#45c089" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="deepdive-stats">
        <div className="deepdive-stat-card">
          <p>Network Telemetry</p>
          <h4>98.4ms Latency</h4>
          <span>Global Average</span>
        </div>
        <div className="deepdive-stat-card">
          <p>Immutable Volume</p>
          <h4>1.2B</h4>
          <span>Total Locked Value</span>
        </div>
        <div className="deepdive-stat-card">
          <p>Node Health</p>
          <h4>99.9% Uptime</h4>
          <span>{statusLabel ? `Latest Trade: ${statusLabel}` : "342 Active Clusters"}</span>
        </div>
      </div>
    </section>
  );
}
