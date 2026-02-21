import { useEffect, useMemo, useState } from "react";
import { fetchRwaData, fetchRwaLatest } from "../lib/telemetryApi";

const POLL_MS = 5000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_POINTS = 180;

export interface DeepDivePoint {
  ts: string;
  price: number;
  yieldWh: number;
}

function syntheticPriceFromYield(yieldWh: number, basePrice: number) {
  const normalized = Math.log10(Math.max(1, yieldWh)) / 4;
  return Number((basePrice * (0.94 + normalized * 0.12)).toFixed(2));
}

export function useDeepDiveSeries(
  siteId: number,
  fallbackBasePrice: number,
  refreshToken = 0,
) {
  const [series, setSeries] = useState<DeepDivePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const to = new Date();
      const from = new Date(to.getTime() - WINDOW_MS);
      setLoading(true);
      try {
        const dataPoints = await fetchRwaData({
          rwaId: siteId,
          from: from.toISOString(),
          to: to.toISOString(),
          limit: MAX_POINTS,
        });
        if (cancelled) return;

        let nextSeries = dataPoints.map((point) => ({
          ts: new Date(point.ts).toISOString(),
          price: Number((point.price_cents / 100).toFixed(2)),
          yieldWh: point.kwh,
        }));

        if (nextSeries.length === 0) {
          const latest = await fetchRwaLatest(siteId);
          if (cancelled) return;
          nextSeries = [
            {
              ts: new Date(latest.ts).toISOString(),
              price: Number((latest.price_cents / 100).toFixed(2)),
              yieldWh: latest.kwh,
            },
          ];
        }

        // Safety fallback for bootstrapping edge cases where backend has sparse fields.
        nextSeries = nextSeries.map((point) => {
          const price = Number.isFinite(point.price) && point.price > 0
            ? point.price
            : syntheticPriceFromYield(point.yieldWh, fallbackBasePrice);
          return {
            ts: point.ts,
            price,
            yieldWh: point.yieldWh,
          };
        });

        setSeries(nextSeries.slice(-MAX_POINTS));
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load RWA timeseries");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [siteId, fallbackBasePrice, refreshToken]);

  return useMemo(() => ({ series, loading, error }), [series, loading, error]);
}
