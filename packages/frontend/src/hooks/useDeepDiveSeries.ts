import { useEffect, useMemo, useState } from "react";
import { fetchPriceHistory, fetchTelemetryHistory } from "../lib/telemetryApi";

const POLL_MS = 5000;
const WINDOW_MS = 60 * 60 * 1000;

export interface DeepDivePoint {
  ts: string;
  price: number;
  yieldWh: number;
}

function syntheticPriceFromYield(yieldWh: number, basePrice: number) {
  const normalized = Math.log10(Math.max(1, yieldWh)) / 4;
  return Number((basePrice * (0.94 + normalized * 0.12)).toFixed(2));
}

export function useDeepDiveSeries(assetId: string, siteId: number, fallbackBasePrice: number) {
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
        const [yieldSeries, priceSeries] = await Promise.allSettled([
          fetchTelemetryHistory({
            siteId,
            from: from.toISOString(),
            to: to.toISOString(),
            limit: 180,
          }),
          fetchPriceHistory({
            assetId,
            from: from.toISOString(),
            to: to.toISOString(),
            limit: 180,
          }),
        ]);
        if (cancelled) return;

        if (yieldSeries.status !== "fulfilled") {
          throw yieldSeries.reason;
        }

        const yieldPoints = yieldSeries.value;
        const priceLookup =
          priceSeries.status === "fulfilled"
            ? new Map(priceSeries.value.map((point) => [new Date(point.ts).toISOString(), point.price]))
            : new Map<string, number>();

        const nextSeries = yieldPoints.map((point, index) => {
          const key = new Date(point.ts).toISOString();
          const price =
            priceLookup.get(key) ??
            (priceSeries.status === "fulfilled" && priceSeries.value[index]
              ? priceSeries.value[index].price
              : syntheticPriceFromYield(point.watt_hours, fallbackBasePrice));
          return {
            ts: key,
            price,
            yieldWh: point.watt_hours,
          };
        });

        setSeries(nextSeries);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load telemetry");
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
  }, [assetId, siteId, fallbackBasePrice]);

  return useMemo(() => ({ series, loading, error }), [series, loading, error]);
}
