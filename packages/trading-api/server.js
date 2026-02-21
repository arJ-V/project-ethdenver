/**
 * Trading API (BFF) for frontend + AI agent integration.
 * - Command path: POST /write-option
 * - Query path: GET /orders, GET /orders/:optionId, GET /timeline/:optionId
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { createReadModelStore } from "./readModelStore.js";
import { createIndexer } from "./indexer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Env load order MUST match contracts-hedera hardhat (root then relayer) so the writer key
// is the same as manual-write-option.js. Otherwise we get ERC20InsufficientAllowance: the desk
// was approved by one wallet but the API signs with another. See docs/HEDERA_E2E_NOTES.md.
const rootEnv = path.join(__dirname, "..", "..", ".env");
const relayerEnv = path.join(__dirname, "..", "relayer-python", ".env");
if (existsSync(rootEnv)) dotenv.config({ path: rootEnv });
if (existsSync(relayerEnv)) dotenv.config({ path: relayerEnv });
dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = parseInt(process.env.PORT || "3001", 10);
const HEDERA_RPC_URL = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
const ADI_RPC_URL = process.env.ADI_RPC_URL || "https://rpc.ab.testnet.adifoundation.ai/";
const MIRROR_BASE_URL = process.env.HEDERA_MIRROR_BASE_URL || "https://testnet.mirrornode.hedera.com";
const WRITER_PRIVATE_KEY = process.env.WRITER_PRIVATE_KEY || process.env.HEDERA_OPERATOR_KEY;
const API_KEY = process.env.TRADING_API_KEY || "";
const READ_MODEL_FILE = process.env.READ_MODEL_FILE || path.join(__dirname, "data", "read-model.json");
const INDEXER_POLL_MS = parseInt(process.env.INDEXER_POLL_MS || "7000", 10);

const STATUS_LABELS = {
  0: "none",
  1: "pending",
  2: "executed",
  3: "liquidated",
};

const ERROR_SELECTORS = {
  "0x2177f6f6": "InvalidBuyer",
  "0x2e6cf814": "InvalidAmount",
  "0xae8f61b8": "InvalidExpiry",
  "0x8baa579f": "InvalidStatus",
  "0x82b42900": "UnauthorizedSettler",
  "0x29be7398": "OptionNotExpired",
  "0x90b8ec18": "TransferFailed",
  "0xf2673bd5": "OracleNotInitialized",
  "0x634e0648": "OracleStale",
  "0xbebf6f7c": "OracleTooFuture",
  "0x09f39f8b": "OracleWindowMiss",
  "0x327e2f4e": "HssScheduleFailed",
  // Standard Error(string) from require("message")
  "0x08c379a0": "Error(string)",
  // HederaOptionsDesk (Solidity canonical ErrorName())
  "0xb1df0e06": "InvalidBuyer",
  "0x2c5211c6": "InvalidAmount",
  "0xd36c8500": "InvalidExpiry",
  "0x4eb0db8f": "OracleNotInitialized",
  "0x04578698": "OracleStale",
  "0x35e3fc12": "OracleTooFuture",
  "0x0a32e144": "OracleWindowMiss",
  "0xbd2f0308": "HssScheduleFailed",
  // OpenZeppelin ERC20 (from ySolar transferFrom)
  "0xfb8f41b2": "ERC20InsufficientAllowance",
  "0xe450d38c": "ERC20InsufficientBalance",
};

function loadManifest() {
  const manifestPath = path.join(__dirname, "..", "..", "docs", "deployed-addresses.json");
  if (!existsSync(manifestPath)) return {};
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

const manifest = loadManifest();
const DESK_ADDRESS = process.env.HEDERA_OPTIONS_DESK_ADDRESS || manifest?.hedera?.optionsDeskAddress || null;
const ADI_VAULT_ADDRESS = process.env.ADI_VAULT_ADDRESS || manifest?.adi?.vaultAddress || null;

const DESK_ABI = [
  "function writeOption(address buyer, uint256 amount, uint256 strike, uint256 expiry) external returns (uint256 optionId)",
  "function options(uint256 optionId) external view returns (address writer, address buyer, uint256 amount, uint256 strike, uint256 expiry, bytes32 scheduleRef, uint8 status)",
  "event OptionWritten(uint256 indexed optionId, address indexed writer, address indexed buyer, uint256 amount, uint256 strike, uint256 expiry)",
];

const readModelStore = createReadModelStore(READ_MODEL_FILE);
const indexer = createIndexer({
  hederaRpcUrl: HEDERA_RPC_URL,
  adiRpcUrl: ADI_RPC_URL,
  deskAddress: DESK_ADDRESS,
  adiVaultAddress: ADI_VAULT_ADDRESS,
  mirrorBaseUrl: MIRROR_BASE_URL,
  pollMs: INDEXER_POLL_MS,
  store: readModelStore,
  onError: (err) => console.warn("[indexer]", err.message || String(err)),
});

// Serialize write-option so only one tx is in flight per writer (avoids "existing transaction had higher priority" nonce conflicts).
let writeOptionLock = Promise.resolve();

const app = express();
app.use(cors());
app.use(express.json());

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    return sendError(res, 401, "AUTH_REQUIRED", "Missing or invalid API key");
  }
  next();
}

function sendError(res, httpStatus, code, message, details) {
  return res.status(httpStatus).json({
    ok: false,
    error: { code, message, details: details || null },
  });
}

function sendOk(res, payload) {
  return res.json({ ok: true, ...payload });
}

function getReadDesk(provider) {
  if (!DESK_ADDRESS) return null;
  return new ethers.Contract(DESK_ADDRESS, DESK_ABI, provider);
}

app.get("/health", async (req, res) => {
  const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
  let chainId = null;
  try {
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);
  } catch {
    chainId = null;
  }
  return sendOk(res, {
    service: "trading-api",
    chainId,
    indexer: readModelStore.getState().meta,
  });
});

app.post("/write-option", requireApiKey, async (req, res) => {
  if (!WRITER_PRIVATE_KEY) {
    return sendError(res, 503, "CONFIG_MISSING_WRITER_KEY", "WRITER_PRIVATE_KEY (or HEDERA_OPERATOR_KEY) is not configured");
  }
  if (!DESK_ADDRESS) {
    return sendError(res, 503, "CONFIG_MISSING_DESK_ADDRESS", "Options desk address is not configured");
  }

  const { buyer, amount, strike, expiry } = req.body || {};
  if (!buyer || amount == null || strike == null || expiry == null) {
    return sendError(res, 400, "VALIDATION_ERROR", "Missing required fields: buyer, amount, strike, expiry");
  }
  if (!ethers.isAddress(buyer)) {
    return sendError(res, 400, "VALIDATION_ERROR", "Invalid buyer address");
  }

  let amountBn;
  let strikeBn;
  let expiryBn;
  try {
    amountBn = BigInt(amount);
    strikeBn = BigInt(strike);
    expiryBn = BigInt(expiry);
  } catch {
    return sendError(res, 400, "VALIDATION_ERROR", "amount, strike, expiry must be numeric");
  }
  if (amountBn <= 0n || strikeBn <= 0n) {
    return sendError(res, 400, "VALIDATION_ERROR", "amount and strike must be positive");
  }

  const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
  const wallet = new ethers.Wallet(WRITER_PRIVATE_KEY, provider);
  const desk = new ethers.Contract(DESK_ADDRESS, DESK_ABI, wallet);

  const runWrite = async () => {
    const tx = await desk.writeOption(buyer, amountBn, strikeBn, expiryBn);
    const receipt = await tx.wait();
    return { tx, receipt };
  };

  try {
    const prev = writeOptionLock;
    let resolveLock;
    writeOptionLock = new Promise((r) => { resolveLock = r; });
    await prev;
    let tx;
    let receipt;
    try {
      const out = await runWrite();
      tx = out.tx;
      receipt = out.receipt;
    } finally {
      resolveLock();
    }
    const iface = new ethers.Interface(DESK_ABI);
    let optionId = null;
    for (const log of receipt?.logs || []) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "OptionWritten") {
          optionId = parsed.args.optionId.toString();
          break;
        }
      } catch {
        // Ignore unrelated logs.
      }
    }

    // Trigger a read-model refresh quickly after command execution.
    await indexer.runOnce();
    return sendOk(res, {
      txHash: receipt?.hash ?? tx.hash,
      optionId: optionId || "unknown",
      status: "created",
    });
  } catch (err) {
    const rawMessage = err?.shortMessage || err?.reason || err?.message || String(err);
    const selector = extractSelector(err);
    const decoded = selector && ERROR_SELECTORS[selector] ? ERROR_SELECTORS[selector] : null;
    const code = decoded ? `CONTRACT_${decoded.toUpperCase()}` : "WRITE_OPTION_FAILED";
    const status = err?.code === "INSUFFICIENT_FUNDS" ? 400 : 502;
    const message = decoded ? decoded : (selector ? `unknown custom error (selector: ${selector})` : rawMessage);
    if (!decoded) {
      console.error("[write-option] revert selector:", selector || "none", "data:", err?.data || err?.info?.error?.data || "(no data)", "code:", err?.code);
    }
    return sendError(res, status, code, message, {
      selector: selector || null,
      rpcCode: err?.code || null,
    });
  }
});

app.get("/orders/:optionId", async (req, res) => {
  if (!DESK_ADDRESS) {
    return sendError(res, 503, "CONFIG_MISSING_DESK_ADDRESS", "Options desk address is not configured");
  }
  const { optionId } = req.params;
  let optionIdBn;
  try {
    optionIdBn = BigInt(optionId);
  } catch {
    return sendError(res, 400, "VALIDATION_ERROR", "optionId must be numeric");
  }

  const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
  const desk = getReadDesk(provider);
  try {
    const raw = await desk.options(optionIdBn);
    if (!raw || String(raw.writer).toLowerCase() === ethers.ZeroAddress) {
      return sendError(res, 404, "NOT_FOUND", `Option ${optionId} not found`);
    }
    const order = {
      optionId: String(optionIdBn),
      writer: raw.writer,
      buyer: raw.buyer,
      amount: raw.amount.toString(),
      strike: raw.strike.toString(),
      expiry: raw.expiry.toString(),
      scheduleRef: raw.scheduleRef,
      statusCode: Number(raw.status),
      statusLabel: STATUS_LABELS[Number(raw.status)] || "unknown",
    };
    const timeline = readModelStore.getTimeline(String(optionIdBn), [order.writer, order.buyer]);
    return sendOk(res, { order, timeline });
  } catch (err) {
    return sendError(res, 502, "READ_OPTION_FAILED", err?.shortMessage || err?.message || String(err));
  }
});

app.get("/orders", async (req, res) => {
  const { writer, buyer, status } = req.query;
  const orders = readModelStore.listOrders({
    writer: writer || undefined,
    buyer: buyer || undefined,
    status: status || undefined,
  });
  return sendOk(res, { orders, count: orders.length });
});

app.get("/timeline/:optionId", async (req, res) => {
  const { optionId } = req.params;
  const storeOrder = readModelStore.getOrder(optionId);
  const linked = storeOrder ? [storeOrder.writer, storeOrder.buyer] : [];
  const timeline = readModelStore.getTimeline(optionId, linked);
  return sendOk(res, { optionId: String(optionId), events: timeline });
});

// Optional operator endpoint: force a single poll cycle.
app.post("/admin/reindex", requireApiKey, async (req, res) => {
  await indexer.runOnce();
  return sendOk(res, { status: "reindexed" });
});

app.listen(PORT, () => {
  console.log(`Trading API listening on http://localhost:${PORT}`);
  if (!WRITER_PRIVATE_KEY) console.warn("WRITER_PRIVATE_KEY missing; command path disabled");
  if (!DESK_ADDRESS) console.warn("HEDERA_OPTIONS_DESK_ADDRESS missing; read/write endpoints may fail");
  if (API_KEY) console.log("API key auth enabled for write/admin endpoints");
  indexer.start();
});

function extractSelector(err) {
  const data =
    err?.data ||
    err?.info?.error?.data ||
    err?.error?.data ||
    err?.error?.error?.data ||
    err?.transaction?.data ||
    "";
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    return data.slice(0, 10).toLowerCase();
  }
  if (typeof data === "string" && data.length >= 8) {
    const hex = data.startsWith("0x") ? data : "0x" + data;
    if (hex.length >= 10) return hex.slice(0, 10).toLowerCase();
  }
  return null;
}
