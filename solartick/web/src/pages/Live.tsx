import { useEffect, useState, useRef, useCallback } from "react";
import Chart from "../components/Chart";
import TelemetryTable from "../components/TelemetryTable";
import { liveEventSource, resetForDemo, isDemoResetEnabled, type TelemetryPoint } from "../lib/api";

const LIVE_MAX_POINTS = 200;

export default function Live() {
  const [siteId, setSiteId] = useState(1);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [lastTs, setLastTs] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(0);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setStatus("connecting");
    const es = liveEventSource(siteId);
    esRef.current = es;

    es.onopen = () => setStatus("connected");
    es.onerror = () => {
      setStatus("error");
      es.close();
      esRef.current = null;
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === "connected") return;
        const point: TelemetryPoint = {
          site_id: data.site_id,
          ts: data.ts,
          watt_hours: data.watt_hours,
          battery_soc: data.battery_soc,
          tx_hash: data.tx_hash,
          block_number: data.block_number,
          log_index: data.log_index,
        };
        setPoints((prev) => {
          const next = [...prev, point];
          return next.length > LIVE_MAX_POINTS ? next.slice(-LIVE_MAX_POINTS) : next;
        });
        setLastTs(data.ts);
      } catch {
        // ignore non-telemetry events
      }
    };

    return () => {
      es.close();
      esRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [siteId]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, [connect]);

  const handleReset = async () => {
    try {
      await resetForDemo();
      setPoints([]);
      setLastTs(null);
    } catch (err) {
      alert(String(err));
    }
  };

  const latest = points.length ? points[points.length - 1] : null;

  return (
    <div style={{ padding: "1rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Live telemetry</h1>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <label>
          Site ID{" "}
          <input
            type="number"
            min={1}
            value={siteId}
            onChange={(e) => setSiteId(Number(e.target.value) || 1)}
          />
        </label>
        <span style={{ color: status === "connected" ? "#34d399" : status === "error" ? "#f87171" : "#fbbf24" }}>
          {status === "connecting" && "Connecting…"}
          {status === "connected" && "Connected"}
          {status === "error" && "Disconnected (reconnecting…)"}
        </span>
        {isDemoResetEnabled() && (
          <button type="button" onClick={handleReset}>
            Clear data (demo)
          </button>
        )}
      </div>

      {latest && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ background: "#1e293b", padding: "1rem", borderRadius: 8 }}>
            <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Watt-hours</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{latest.watt_hours.toLocaleString()}</div>
          </div>
          <div style={{ background: "#1e293b", padding: "1rem", borderRadius: 8 }}>
            <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Battery SOC</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
              {latest.battery_soc != null ? `${(latest.battery_soc * 100).toFixed(2)}%` : "—"}
            </div>
          </div>
          <div style={{ background: "#1e293b", padding: "1rem", borderRadius: 8 }}>
            <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Last update</div>
            <div style={{ fontSize: "0.9rem" }}>{lastTs ? new Date(lastTs).toISOString() : "—"}</div>
          </div>
        </div>
      )}

      {!latest && status === "connected" && (
        <p style={{ color: "#64748b", marginBottom: "1rem" }}>Waiting for data…</p>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Live chart (last {LIVE_MAX_POINTS} points)</h2>
        <Chart data={points} maxPoints={LIVE_MAX_POINTS} height={300} />
      </div>
      <div>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Streaming table</h2>
        <TelemetryTable data={points} maxRows={50} />
      </div>
    </div>
  );
}
