import { useEffect, useMemo, useState } from "react";
import { fetchOrders, fetchTimeline } from "../lib/tradingApi";
import { fetchRwaFeed } from "../lib/rwaApi";
import type { TimelineEvent } from "../lib/types";

const POLL_MS = 5000;

function eventKey(event: TimelineEvent) {
  const source = String(event.source ?? "trade");
  const tx = event.txHash ?? "no-tx";
  const ts = event.timestamp ?? "no-ts";
  const label = event.label ?? event.type;
  return `${source}:${event.optionId ?? "unknown"}:${tx}:${label}:${ts}`;
}

function sortByTimestampDesc(events: TimelineEvent[]) {
  return [...events].sort((a, b) => {
    const left = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const right = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return right - left;
  });
}

export function useLedgerFeed(limit = 80) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const orders = await fetchOrders();
        const optionIds = orders.orders.map((order) => order.optionId).slice(0, 8);
        const timelineGroups = await Promise.all(optionIds.map(async (id) => fetchTimeline(id)));
        const oracleFeed = await fetchRwaFeed(40);
        if (cancelled) return;

        const merged: TimelineEvent[] = timelineGroups.flatMap((group) =>
          group.events.map((event) => ({
            ...event,
            source: "trade" as const,
            optionId: event.optionId ?? group.optionId,
          })),
        );
        const oracleEvents: TimelineEvent[] = oracleFeed.map((item) => ({
          type: "OracleYieldUpdated",
          label: `RWA ${item.rwa_adi_id} → $${(item.price_cents / 100).toFixed(2)} @ ${item.kwh} kWh`,
          status: "executed",
          chain: "oracle",
          txHash: item.tx_hash ?? undefined,
          timestamp: item.ts,
          optionId: `rwa-${item.rwa_adi_id}`,
          source: "oracle",
        }));

        const deduped = new Map<string, TimelineEvent>();
        for (const event of [...merged, ...oracleEvents]) {
          deduped.set(eventKey(event), event);
        }
        setEvents(sortByTimestampDesc(Array.from(deduped.values())).slice(0, limit));
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Ledger feed unavailable");
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [limit]);

  return useMemo(() => ({ events, error }), [events, error]);
}
