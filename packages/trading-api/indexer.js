import { ethers } from "ethers";

const DESK_EVENT_ABI = [
  "event OptionWritten(uint256 indexed optionId, address indexed writer, address indexed buyer, uint256 amount, uint256 strike, uint256 expiry)",
  "event CollateralLocked(uint256 indexed optionId, address indexed writer, uint256 amount)",
  "event SettlementScheduled(uint256 indexed optionId, bytes32 indexed scheduleRef, uint256 expiry)",
  "event OptionSettled(uint256 indexed optionId, address indexed buyer, uint256 amount, uint256 oracleYieldIndex, uint256 oracleRoundId, uint256 oracleUpdatedAt)",
  "event CollateralReleased(uint256 indexed optionId, address indexed writer, uint256 amount, uint256 oracleYieldIndex, uint256 oracleRoundId, uint256 oracleUpdatedAt)",
  "event CollateralSlashed(uint256 indexed optionId, address indexed buyer, uint256 amount, uint256 oracleYieldIndex, uint256 oracleRoundId, uint256 oracleUpdatedAt)",
  "event SettlementFailed(uint256 indexed optionId, string reason, uint256 oracleRoundId, uint256 oracleUpdatedAt)",
  "event SettlementExecutionAttempt(uint256 indexed optionId, address indexed caller, uint256 blockTs, uint256 optionExpiry, uint8 optionStatus, uint256 oracleYieldIndex, uint256 oracleRoundId, uint256 oracleUpdatedAt, uint256 deskBalance, uint256 payoutPreview)",
  "event SettlementFailureDetail(uint256 indexed optionId, bytes4 errorSelector, bytes revertData, string decodedReason)",
];

const ADI_EVENT_ABI = [
  "event AssetLocked(uint256 indexed assetId, address indexed owner, uint256 expectedYieldKWh, uint256 lockTs)",
  "event YieldMintRequested(uint256 indexed assetId, uint256 expectedYieldKWh, address indexed beneficiary)",
];

const STATUS_FROM_EVENT = {
  OptionWritten: "created",
  SettlementScheduled: "pending",
  OptionSettled: "executed",
  CollateralReleased: "executed",
  SettlementFailed: "failed",
  CollateralSlashed: "liquidated",
};

export function createIndexer({
  hederaRpcUrl,
  adiRpcUrl,
  deskAddress,
  adiVaultAddress,
  mirrorBaseUrl,
  pollMs,
  store,
  onError,
}) {
  const hederaProvider = new ethers.JsonRpcProvider(hederaRpcUrl);
  const adiProvider = new ethers.JsonRpcProvider(adiRpcUrl);
  const deskIface = new ethers.Interface(DESK_EVENT_ABI);
  const adiIface = new ethers.Interface(ADI_EVENT_ABI);

  let timer = null;
  let isRunning = false;
  let mirrorHealthy = true;

  async function runOnce() {
    if (isRunning) return;
    isRunning = true;
    try {
      await ingestAdiLogs(adiProvider, adiVaultAddress, adiIface, store);
      if (mirrorHealthy) {
        try {
          await ingestHederaMirrorLogs(mirrorBaseUrl, deskAddress, deskIface, store);
        } catch (err) {
          mirrorHealthy = false;
          onError?.(new Error(`Mirror API failed; falling back to RPC logs: ${err.message}`));
        }
      }
      await ingestHederaRpcLogs(hederaProvider, deskAddress, deskIface, store);
      store.setPollMeta({ lastPollAt: new Date().toISOString(), lastPollError: null });
    } catch (err) {
      store.setPollMeta({ lastPollAt: new Date().toISOString(), lastPollError: err.message || String(err) });
      onError?.(err);
    } finally {
      isRunning = false;
    }
  }

  return {
    start() {
      runOnce();
      timer = setInterval(runOnce, pollMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runOnce,
  };
}

async function ingestAdiLogs(provider, vaultAddress, iface, store) {
  if (!vaultAddress) return;
  const latest = await provider.getBlockNumber();
  let from = Number(store.getCursor("adiBlock") || 0);
  if (from === 0) from = Math.max(0, latest - 2000);
  if (from > latest) return;

  const logs = await provider.getLogs({
    address: vaultAddress,
    fromBlock: from,
    toBlock: latest,
  });

  for (const log of logs) {
    const parsed = safeParseLog(iface, log);
    if (!parsed) continue;
    const eventKey = `99999:${log.transactionHash}:${log.index}`;
    if (store.hasProcessed(eventKey)) continue;
    const block = await provider.getBlock(log.blockNumber);
    const args = parsed.args || {};
    store.addEvent({
      eventKey,
      source: "adi",
      event: parsed.name,
      optionId: null,
      assetId: asStr(args.assetId),
      owner: args.owner || null,
      beneficiary: args.beneficiary || null,
      expectedYieldKWh: asStr(args.expectedYieldKWh),
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.index),
      ts: tsFromBlock(block),
      statusLabel: null,
    });
    store.markProcessed(eventKey);
  }

  store.setCursor("adiBlock", latest + 1);
}

async function ingestHederaRpcLogs(provider, deskAddress, iface, store) {
  if (!deskAddress) return;
  const latest = await provider.getBlockNumber();
  let from = Number(store.getCursor("hederaBlock") || 0);
  if (from === 0) from = Math.max(0, latest - 2000);
  if (from > latest) return;

  const logs = await provider.getLogs({
    address: deskAddress,
    fromBlock: from,
    toBlock: latest,
  });

  for (const log of logs) {
    const parsed = safeParseLog(iface, log);
    if (!parsed) continue;
    const eventKey = `296:${log.transactionHash}:${log.index}`;
    if (store.hasProcessed(eventKey)) continue;
    const block = await provider.getBlock(log.blockNumber);
    const normalized = normalizeDeskEvent({
      parsed,
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.index),
      ts: tsFromBlock(block),
      eventKey,
    });
    store.addEvent(normalized);
    applyOrderPatch(store, normalized);
    store.markProcessed(eventKey);
  }

  store.setCursor("hederaBlock", latest + 1);
}

async function ingestHederaMirrorLogs(mirrorBaseUrl, deskAddress, iface, store) {
  if (!mirrorBaseUrl || !deskAddress) return;
  const cursorTs = store.getCursor("hederaMirrorTs");
  const tsQuery = cursorTs ? `&timestamp=gt:${encodeURIComponent(cursorTs)}` : "";
  const url = `${mirrorBaseUrl}/api/v1/contracts/${deskAddress}/results/logs?order=asc&limit=100${tsQuery}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror HTTP ${res.status}`);
  }
  const data = await res.json();
  const logs = Array.isArray(data.logs) ? data.logs : [];
  for (const entry of logs) {
    const topics = entry.topics || [entry.topic0, entry.topic1, entry.topic2, entry.topic3].filter(Boolean);
    const parsed = safeParseLog(iface, { topics, data: entry.data || "0x" });
    if (!parsed) continue;
    const txHash = entry.transaction_hash || entry.transactionHash || "";
    const logIndex = Number(entry.index ?? entry.log_index ?? 0);
    const eventKey = `296:${txHash}:${logIndex}`;
    if (store.hasProcessed(eventKey)) continue;
    const normalized = normalizeDeskEvent({
      parsed,
      txHash,
      blockNumber: Number(entry.block_number ?? 0),
      logIndex,
      ts: normalizeMirrorTs(entry.timestamp),
      eventKey,
    });
    store.addEvent(normalized);
    applyOrderPatch(store, normalized);
    store.markProcessed(eventKey);
  }

  if (logs.length > 0) {
    const lastTs = logs[logs.length - 1].timestamp;
    store.setCursor("hederaMirrorTs", lastTs);
  }
}

function safeParseLog(iface, log) {
  try {
    return iface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return null;
  }
}

function normalizeDeskEvent({ parsed, txHash, blockNumber, logIndex, ts, eventKey }) {
  const args = parsed.args || {};
  const optionId = args.optionId != null ? asStr(args.optionId) : null;
  const out = {
    eventKey,
    source: "hedera",
    event: parsed.name,
    optionId,
    txHash,
    blockNumber,
    logIndex,
    ts,
    statusLabel: STATUS_FROM_EVENT[parsed.name] || null,
  };

  if (parsed.name === "OptionWritten") {
    out.writer = args.writer;
    out.buyer = args.buyer;
    out.amount = asStr(args.amount);
    out.strike = asStr(args.strike);
    out.expiry = asStr(args.expiry);
  }
  if (parsed.name === "SettlementScheduled") {
    out.scheduleRef = args.scheduleRef;
    out.expiry = asStr(args.expiry);
  }
  if (parsed.name === "SettlementFailed") {
    out.reason = args.reason;
    out.oracleRoundId = asStr(args.oracleRoundId);
    out.oracleUpdatedAt = asStr(args.oracleUpdatedAt);
  }
  if (parsed.name === "OptionSettled" || parsed.name === "CollateralReleased" || parsed.name === "CollateralSlashed") {
    out.amount = asStr(args.amount);
    out.oracleYieldIndex = asStr(args.oracleYieldIndex);
    out.oracleRoundId = asStr(args.oracleRoundId);
    out.oracleUpdatedAt = asStr(args.oracleUpdatedAt);
  }
  return out;
}

function applyOrderPatch(store, event) {
  if (!event.optionId) return;
  const id = event.optionId;
  if (event.event === "OptionWritten") {
    store.upsertOrder(id, {
      writer: event.writer,
      buyer: event.buyer,
      amount: event.amount,
      strike: event.strike,
      expiry: event.expiry,
      statusLabel: "created",
      lastEvent: event.event,
      updatedAt: event.ts,
    });
    return;
  }
  const patch = {
    statusLabel: event.statusLabel || undefined,
    lastEvent: event.event,
    updatedAt: event.ts,
  };
  if (event.scheduleRef) patch.scheduleRef = event.scheduleRef;
  if (event.reason) patch.failureReason = event.reason;
  store.upsertOrder(id, patch);
}

function asStr(value) {
  if (value == null) return null;
  try {
    return value.toString();
  } catch {
    return String(value);
  }
}

function tsFromBlock(block) {
  if (!block?.timestamp) return new Date().toISOString();
  return new Date(Number(block.timestamp) * 1000).toISOString();
}

function normalizeMirrorTs(ts) {
  // Mirror timestamps are usually "seconds.nanoseconds".
  if (!ts) return new Date().toISOString();
  if (String(ts).includes(".")) {
    const [sec] = String(ts).split(".");
    return new Date(Number(sec) * 1000).toISOString();
  }
  return new Date(ts).toISOString();
}
