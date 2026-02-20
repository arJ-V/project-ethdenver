import type { TelemetryPoint } from "../lib/api";

interface TelemetryTableProps {
  data: TelemetryPoint[];
  maxRows?: number;
}

export default function TelemetryTable({ data, maxRows = 50 }: TelemetryTableProps) {
  const rows = data.length > maxRows ? data.slice(-maxRows) : data;
  const display = [...rows].reverse();

  if (display.length === 0) {
    return (
      <p style={{ color: "#64748b", padding: "1rem" }}>No telemetry points yet.</p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #334155" }}>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Time (UTC)</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Watt-hours</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Battery SOC</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Tx hash</th>
          </tr>
        </thead>
        <tbody>
          {display.map((d, i) => (
            <tr key={`${d.tx_hash}-${d.log_index}-${i}`} style={{ borderBottom: "1px solid #1e293b" }}>
              <td style={{ padding: "0.5rem" }}>{new Date(d.ts).toISOString()}</td>
              <td style={{ textAlign: "right", padding: "0.5rem" }}>{d.watt_hours.toLocaleString()}</td>
              <td style={{ textAlign: "right", padding: "0.5rem" }}>
                {d.battery_soc != null ? `${(d.battery_soc * 100).toFixed(2)}%` : "—"}
              </td>
              <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
                {d.tx_hash.slice(0, 10)}…{d.tx_hash.slice(-8)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
