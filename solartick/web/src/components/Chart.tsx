import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TelemetryPoint } from "../lib/api";

interface ChartProps {
  data: TelemetryPoint[];
  maxPoints?: number;
  height?: number;
}

export default function Chart({ data, maxPoints = 200, height = 300 }: ChartProps) {
  const series = useMemo(() => {
    const slice = data.length > maxPoints ? data.slice(-maxPoints) : data;
    return slice.map((d) => ({
      ts: new Date(d.ts).toLocaleTimeString(),
      watt_hours: d.watt_hours,
      battery_soc: d.battery_soc != null ? d.battery_soc * 100 : null,
    }));
  }, [data, maxPoints]);

  if (series.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        No data to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="ts" stroke="#94a3b8" fontSize={11} />
        <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #475569" }}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(value: number) => [value, ""]}
        />
        <Line type="monotone" dataKey="watt_hours" stroke="#38bdf8" dot={false} name="Watt-hours" />
        <Line type="monotone" dataKey="battery_soc" stroke="#34d399" dot={false} name="Battery %" />
      </LineChart>
    </ResponsiveContainer>
  );
}
