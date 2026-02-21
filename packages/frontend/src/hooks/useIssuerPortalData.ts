import { useEffect, useMemo, useState } from "react";
import { bootstrapRwa, fetchRwaHealth, listRwas, type RwaListItem } from "../lib/rwaApi";
import { fetchOrders, fetchTimeline, fetchTradingHealth } from "../lib/tradingApi";
import type { OrderSnapshot } from "../lib/types";

const POLL_MS = 8000;
const STALE_MS = 10 * 60 * 1000;

type MintStatus = "requested" | "processing" | "minted" | "failed";
type AuditActionType = "all" | "lock" | "request" | "mint" | "settle" | "compliance-check";

export interface PendingMintRow {
  requestId: string;
  beneficiary: string;
  amount: string;
  requestedAt: string;
  status: MintStatus;
  txHash: string;
  failReason?: string;
}

export interface AuditRow {
  id: string;
  timestamp: string;
  actionType: AuditActionType | "other";
  action: string;
  actor: string;
  reference: string;
  txHash: string;
  status: string;
}

function mapStatus(status: string): MintStatus {
  if (status === "created") return "requested";
  if (status === "pending") return "processing";
  if (status === "executed") return "minted";
  return "failed";
}

function mapRwaStatus(rwa: RwaListItem): MintStatus {
  const bootstrap = (rwa.bootstrap_status || "").toLowerCase();
  if (bootstrap.includes("fail")) return "failed";
  if (bootstrap.includes("created")) return "processing";
  if (bootstrap.includes("locked")) return "minted";
  return "requested";
}

function classifyAction(eventType: string): AuditActionType | "other" {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("collaterallocked") || normalized.includes("assetlocked")) return "lock";
  if (normalized.includes("optionwritten")) return "request";
  if (normalized.includes("mint")) return "mint";
  if (
    normalized.includes("settle") ||
    normalized.includes("settlement") ||
    normalized.includes("released") ||
    normalized.includes("slashed")
  ) {
    return "settle";
  }
  if (normalized.includes("kyc") || normalized.includes("kyb") || normalized.includes("compliance")) {
    return "compliance-check";
  }
  return "other";
}

function toIsoMaybe(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

export function useIssuerPortalData() {
  const [orders, setOrders] = useState<OrderSnapshot[]>([]);
  const [rwas, setRwas] = useState<RwaListItem[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [complianceRefreshAt, setComplianceRefreshAt] = useState<string | null>(null);
  const [tradingHealthy, setTradingHealthy] = useState<boolean>(false);
  const [rwaHealthy, setRwaHealthy] = useState<boolean>(false);
  const [indexerError, setIndexerError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createRwaResult, setCreateRwaResult] = useState<{
    id: number;
    assetId: number;
    mintTxHash: string;
    lockTxHash: string;
    beneficiary: string;
    status: string;
    ts: string;
  } | null>(null);
  const [createRwaError, setCreateRwaError] = useState<string | null>(null);
  const [createRwaStage, setCreateRwaStage] = useState<"idle" | "creating" | "locking" | "queued">("idle");
  const [isSubmittingRwa, setIsSubmittingRwa] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const [ordersResp, rwasResp, tradingHealth, rwaHealth] = await Promise.all([
          fetchOrders(),
          listRwas(),
          fetchTradingHealth(),
          fetchRwaHealth(),
        ]);
        if (cancelled) return;

        setOrders(ordersResp.orders);
        setRwas(rwasResp);
        setTradingHealthy(true);
        setRwaHealthy(rwaHealth.status === "ok");
        setComplianceRefreshAt(new Date().toISOString());
        setIndexerError(tradingHealth.indexer?.lastPollError || null);
        setLoadError(null);

        const timelineGroups = await Promise.all(
          ordersResp.orders.slice(0, 20).map(async (order) => {
            try {
              const group = await fetchTimeline(order.optionId);
              return { optionId: order.optionId, events: group.events };
            } catch {
              return { optionId: order.optionId, events: [] };
            }
          }),
        );
        if (cancelled) return;
        const nextAuditRows: AuditRow[] = timelineGroups.flatMap((group) =>
          group.events.map((event, idx) => {
            const eventType = event.type || event.label || "event";
            return {
              id: `${group.optionId}-${idx}-${eventType}`,
              timestamp: toIsoMaybe(event.timestamp),
              actionType: classifyAction(eventType),
              action: eventType,
              actor: event.chain || "system",
              reference: group.optionId,
              txHash: event.txHash || "—",
              status: event.status || "tracked",
            };
          }),
        );

        const nowTs = new Date().toISOString();
        nextAuditRows.unshift({
          id: `compliance-${nowTs}`,
          timestamp: toIsoMaybe(nowTs),
          actionType: "compliance-check",
          action: "Compliance status refresh",
          actor: "issuer-portal",
          reference: "compliance",
          txHash: "—",
          status: "verified",
        });

        setAuditRows(nextAuditRows);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Issuer data unavailable");
        setTradingHealthy(false);
        setRwaHealthy(false);
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const pipelineCounts = useMemo(() => {
    const counts = { requested: 0, processing: 0, minted: 0, failed: 0 };
    for (const rwa of rwas) {
      const mapped = mapRwaStatus(rwa);
      counts[mapped] += 1;
    }
    return counts;
  }, [rwas]);

  const pendingMintRows = useMemo<PendingMintRow[]>(() => {
    return rwas
      .map((rwa) => {
        const status = mapRwaStatus(rwa);
        return {
          requestId: String(rwa.rwa_adi_id),
          beneficiary: rwa.beneficiary_address || "—",
          amount: String(rwa.latest_kwh ?? "—"),
          requestedAt: toIsoMaybe(rwa.latest_ts || undefined),
          status,
          txHash: rwa.lock_tx_hash || "—",
        };
      })
      .filter((row) => row.status === "requested" || row.status === "processing");
  }, [rwas]);

  const needsAttention = useMemo(() => {
    const failedOrders = orders.filter((order) => {
      const status = mapStatus(order.statusLabel);
      return status === "failed";
    });
    const staleRwas = rwas.filter((rwa) => {
      if (!rwa.latest_ts) return true;
      const ts = new Date(rwa.latest_ts).getTime();
      return Date.now() - ts > STALE_MS;
    });
    return { failedOrders, staleRwas };
  }, [orders, rwas]);

  async function submitRwa(kwh: number) {
    setCreateRwaError(null);
    setCreateRwaStage("creating");
    setIsSubmittingRwa(true);
    try {
      setCreateRwaStage("locking");
      const result = await bootstrapRwa(kwh);
      setCreateRwaStage("queued");
      setCreateRwaResult({
        id: result.rwa_adi_id,
        assetId: result.asset_id,
        mintTxHash: result.mint_tx_hash,
        lockTxHash: result.lock_tx_hash,
        beneficiary: result.beneficiary,
        status: result.status,
        ts: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      setCreateRwaStage("idle");
      setCreateRwaError(error instanceof Error ? error.message : "RWA bootstrap failed");
      throw error;
    } finally {
      setIsSubmittingRwa(false);
    }
  }

  function filterAudit(actionFilter: AuditActionType) {
    if (actionFilter === "all") return auditRows;
    return auditRows.filter((row) => row.actionType === actionFilter);
  }

  return {
    tradingHealthy,
    rwaHealthy,
    indexerError,
    loadError,
    complianceRefreshAt,
    pipelineCounts,
    pendingMintRows,
    needsAttention,
    rwas,
    auditRows,
    filterAudit,
    submitRwa,
    isSubmittingRwa,
    createRwaError,
    createRwaStage,
    createRwaResult,
  };
}
