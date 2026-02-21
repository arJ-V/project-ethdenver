import { useEffect, useMemo, useState } from "react";
import { fetchOrder, fetchTimeline } from "../lib/tradingApi";
import type { OrderSnapshot, TimelineEvent } from "../lib/types";

const POLL_MS = 5000;
const TERMINAL_STATUSES = new Set(["executed", "failed", "liquidated"]);

interface LifecycleState {
  order: OrderSnapshot | null;
  timeline: TimelineEvent[];
  isLoading: boolean;
  error: string | null;
}

export function useOrderLifecycle(optionId: string | null) {
  const [state, setState] = useState<LifecycleState>({
    order: null,
    timeline: [],
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!optionId) {
      setState({ order: null, timeline: [], isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const [orderData, timelineData] = await Promise.all([fetchOrder(optionId), fetchTimeline(optionId)]);
        if (cancelled) return;
        const nextTimeline = timelineData.events.length ? timelineData.events : orderData.timeline;
        setState({
          order: orderData.order,
          timeline: nextTimeline,
          isLoading: false,
          error: null,
        });

        if (TERMINAL_STATUSES.has(orderData.order.statusLabel) && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to refresh order lifecycle",
        }));
      }
    };

    void tick();
    intervalId = setInterval(() => void tick(), POLL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [optionId]);

  return useMemo(
    () => ({
      ...state,
      isTerminal: !!state.order && TERMINAL_STATUSES.has(state.order.statusLabel),
    }),
    [state],
  );
}
