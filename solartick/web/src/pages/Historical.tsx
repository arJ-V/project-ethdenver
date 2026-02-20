import { useState } from "react";
import Chart from "../components/Chart";
import TelemetryTable from "../components/TelemetryTable";
import { fetchHistory, type TelemetryPoint } from "../lib/api";

function toISOLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function Historical() {
  const [siteId, setSiteId] = useState(1);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 3600 * 1000);
  const [fromStr, setFromStr] = useState(toISOLocal(defaultFrom));
  const [toStr, setToStr] = useState(toISOLocal(now));
  const [limit, setLimit] = useState(10000);
  const [data, setData] = useState<TelemetryPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const from = new Date(fromStr).toISOString();
      const to = new Date(toStr).toISOString();
      const points = await fetchHistory({ site_id: siteId, from, to, limit });
      setData(points);
    } catch (err) {
      setError(String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const stats = data && data.length > 0
    ? {
        count: data.length,
        minWh: Math.min(...data.map((d) => d.watt_hours)),
        maxWh: Math.max(...data.map((d) => d.watt_hours)),
        avgWh: Math.round(data.reduce((a, d) => a + d.watt_hours, 0) / data.length),
        minSoc: data.reduce((a, d) => (d.battery_soc != null && (a == null || d.battery_soc < a) ? d.battery_soc : a), null as number | null),
        maxSoc: data.reduce((a, d) => (d.battery_soc != null && (a == null || d.battery_soc > a) ? d.battery_soc : a), null as number | null),
      }
    : null;

  return (
    <div style={{ padding: "1rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Historical telemetry</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end", marginBottom: "1rem" }}>
        <label>
          Site ID <input type="number" min={1} value={siteId} onChange={(e) => setSiteId(Number(e.target.value) || 1)} />
        </label>
        <label>
          From (datetime, seconds){" "}
          <input type="datetime-local" step={1} value={fromStr} onChange={(e) => setFromStr(e.target.value)} />
        </label>
        <label>
          To (datetime, seconds){" "}
          <input type="datetime-local" step={1} value={toStr} onChange={(e) => setToStr(e.target.value)} />
        </label>
        <label>
          Limit <input type="number" min={1} max={50000} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 1000)} />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Query"}
        </button>
      </form>

      {error && <p style={{ color: "#f87171", marginBottom: "1rem" }}>{error}</p>}

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
          <div style={{ background: "#1e293b", padding: "0.75rem", borderRadius: 8 }}>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Count</div>
            <div style={{ fontWeight: "bold" }}>{stats.count}</div>
          </div>
          <div style={{ background: "#1e293b", padding: "0.75rem", borderRadius: 8 }}>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Watt-hours min / max / avg</div>
            <div style={{ fontSize: "0.9rem" }}>{stats.minWh.toLocaleString()} / {stats.maxWh.toLocaleString()} / {stats.avgWh.toLocaleString()}</div>
          </div>
          {(stats.minSoc != null || stats.maxSoc != null) && (
            <div style={{ background: "#1e293b", padding: "0.75rem", borderRadius: 8 }}>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Battery SOC min / max</div>
              <div style={{ fontSize: "0.9rem" }}>
                {stats.minSoc != null ? `${(stats.minSoc * 100).toFixed(2)}%` : "—"} / {stats.maxSoc != null ? `${(stats.maxSoc * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
          )}
        </div>
      )}

      {data && data.length > 0 && (
        <>
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Chart</h2>
            <Chart data={data} maxPoints={data.length} height={300} />
          </div>
          <div>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Table</h2>
            <TelemetryTable data={data} maxRows={500} />
          </div>
        </>
      )}

      {data && data.length === 0 && !loading && (
        <p style={{ color: "#64748b" }}>No points in the selected range.</p>
      )}
    </div>
  );
}
