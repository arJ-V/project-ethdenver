import { useEffect, useMemo, useState } from "react";
import { listRwas } from "../lib/rwaApi";
import { fetchRwaLatest } from "../lib/telemetryApi";
import type { RwaAsset } from "../data/assets";

const POLL_MS = 5000;

function toDisplayAsset(rwaId: number, priceCents: number): RwaAsset {
  return {
    id: `rwa-${rwaId}`,
    symbol: `RWA${rwaId}`,
    name: `Energy RWA ${rwaId}`,
    price: Number((priceCents / 100).toFixed(2)),
    changePct: 0,
    telemetrySiteId: rwaId,
  };
}

export function useRwaAssets() {
  const [assets, setAssets] = useState<RwaAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const rwas = await listRwas();
        if (cancelled) return;
        if (!rwas.length) {
          setAssets([]);
          setError(null);
          return;
        }

        const details = await Promise.all(
          rwas.map(async (rwa) => {
            try {
              const latest = await fetchRwaLatest(rwa.rwa_adi_id);
              return {
                ...toDisplayAsset(rwa.rwa_adi_id, latest.price_cents),
                symbol: rwa.asset_id ? `RWA${rwa.rwa_adi_id}/A${rwa.asset_id}` : `RWA${rwa.rwa_adi_id}`,
              };
            } catch {
              const kwh = rwa.latest_kwh ?? 0;
              const syntheticPrice = Math.max(1, Math.round((kwh / 100) * 100) / 100);
              return {
                ...toDisplayAsset(rwa.rwa_adi_id, Math.round(syntheticPrice * 100)),
                symbol: rwa.asset_id ? `RWA${rwa.rwa_adi_id}/A${rwa.asset_id}` : `RWA${rwa.rwa_adi_id}`,
              };
            }
          }),
        );
        if (cancelled) return;
        setAssets(details);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setAssets((prev) => prev);
        setError(nextError instanceof Error ? nextError.message : "Failed to load RWAs");
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return useMemo(() => ({ assets, error }), [assets, error]);
}
