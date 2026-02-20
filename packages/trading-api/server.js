/**
 * Trading platform API for the AI copilot.
 * Exposes POST /write-option to submit covered-call orders to HederaOptionsDesk.
 * Writer is the signer (WRITER_PRIVATE_KEY); body supplies buyer, amount, strike, expiry.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";

const HEDERA_RPC_URL = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
const WRITER_PRIVATE_KEY = process.env.WRITER_PRIVATE_KEY || process.env.HEDERA_OPERATOR_KEY;
const PORT = parseInt(process.env.PORT || "3001", 10);

// Desk address: env override or from deployed-addresses.json
function getDeskAddress() {
  if (process.env.HEDERA_OPTIONS_DESK_ADDRESS) {
    return process.env.HEDERA_OPTIONS_DESK_ADDRESS;
  }
  const addrPath = path.join(__dirname, "..", "..", "docs", "deployed-addresses.json");
  if (existsSync(addrPath)) {
    const data = JSON.parse(readFileSync(addrPath, "utf8"));
    return data?.hedera?.optionsDeskAddress;
  }
  return null;
}

const DESK_ADDRESS = getDeskAddress();

const DESK_ABI = [
  "function writeOption(address buyer, uint256 amount, uint256 strike, uint256 expiry) external returns (uint256 optionId)",
  "event OptionWritten(uint256 indexed optionId, address indexed writer, address indexed buyer, uint256 amount, uint256 strike, uint256 expiry)",
];

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "trading-api" });
});

/**
 * POST /write-option
 * Body: { buyer, amount, strike, expiry }
 * - buyer: hex address
 * - amount, strike: number or string (we use BigInt for contract)
 * - expiry: Unix timestamp (must be >= now + 120 per contract)
 * Returns: { txHash, optionId } or 4xx/5xx with error message.
 */
app.post("/write-option", async (req, res) => {
  if (!WRITER_PRIVATE_KEY) {
    return res.status(503).json({
      error: "WRITER_PRIVATE_KEY (or HEDERA_OPERATOR_KEY) not configured",
    });
  }
  if (!DESK_ADDRESS) {
    return res.status(503).json({
      error: "HEDERA_OPTIONS_DESK_ADDRESS not set and deployed-addresses.json not found",
    });
  }

  const { buyer, amount, strike, expiry } = req.body;
  if (!buyer || amount == null || strike == null || expiry == null) {
    return res.status(400).json({
      error: "Missing required fields: buyer, amount, strike, expiry",
    });
  }

  let amountBn, strikeBn, expiryBn;
  try {
    amountBn = BigInt(amount);
    strikeBn = BigInt(strike);
    expiryBn = BigInt(expiry);
  } catch (e) {
    return res.status(400).json({ error: "amount, strike, expiry must be numeric" });
  }

  if (amountBn <= 0n || strikeBn <= 0n) {
    return res.status(400).json({ error: "amount and strike must be positive" });
  }

  if (!ethers.isAddress(buyer)) {
    return res.status(400).json({ error: "Invalid buyer address" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
    const wallet = new ethers.Wallet(WRITER_PRIVATE_KEY, provider);
    const desk = new ethers.Contract(DESK_ADDRESS, DESK_ABI, wallet);

    const tx = await desk.writeOption(buyer, amountBn, strikeBn, expiryBn);
    const receipt = await tx.wait();

    let optionId = null;
    if (receipt?.logs) {
      const iface = new ethers.Interface(DESK_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (parsed && parsed.name === "OptionWritten") {
            optionId = parsed.args.optionId?.toString() ?? null;
            break;
          }
        } catch {
          // ignore non-OptionWritten logs
        }
      }
    }
    if (optionId == null && receipt) {
      // Fallback: nextOptionId - 1 is not reliable without a view call; prefer event.
      optionId = "unknown";
    }

    res.json({
      txHash: receipt?.hash ?? tx.hash,
      optionId,
    });
  } catch (err) {
    const message = err.reason || err.shortMessage || err.message || String(err);
    const code = err.code;
    const status = code === "INSUFFICIENT_FUNDS" || code === "UNPREDICTABLE_GAS_LIMIT" ? 400 : 502;
    res.status(status).json({
      error: message,
      code: code || undefined,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Trading API listening on http://localhost:${PORT}`);
  if (!WRITER_PRIVATE_KEY) console.warn("WRITER_PRIVATE_KEY not set — /write-option will return 503");
  if (!DESK_ADDRESS) console.warn("Options desk address not set — /write-option will return 503");
});
