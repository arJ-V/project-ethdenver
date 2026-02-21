import { Contract, Wallet, JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const PUBLISHER_PRIVATE_KEY = process.env.PUBLISHER_PRIVATE_KEY!;
const TELEMETRY_CONTRACT_ADDRESS = process.env.TELEMETRY_CONTRACT_ADDRESS!;
const BACKEND_URL = process.env.BACKEND_URL || ""; // e.g. http://localhost:8000 – when set, publisher uses RWA list and latest KWH
const SITE_ID = BigInt(process.env.SITE_ID || "1");
const PUBLISH_INTERVAL_MS = parseInt(process.env.PUBLISH_INTERVAL_MS || "5000", 10);
const SIM_SPEED = parseInt(process.env.SIM_SPEED || "3600", 10); // seconds per "sim hour"

if (!PUBLISHER_PRIVATE_KEY || !TELEMETRY_CONTRACT_ADDRESS) {
  console.error("Missing PUBLISHER_PRIVATE_KEY or TELEMETRY_CONTRACT_ADDRESS");
  process.exit(1);
}

const abiPath = join(__dirname, "abi", "SolarTelemetry.json");
const abi = JSON.parse(readFileSync(abiPath, "utf-8"));

const provider = new JsonRpcProvider(MONAD_RPC_URL);
const wallet = new Wallet(PUBLISHER_PRIVATE_KEY, provider);
const contract = new Contract(TELEMETRY_CONTRACT_ADDRESS, abi, wallet);

// --- Smooth trend + small noise KWH generation for RWA mode (visually appealing, less bouncy) ---
function standardNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Growth rate per step: small positive drift + bounded normal noise. Clamped so no single step is huge. */
const DRIFT_PER_STEP = 0.0008; // ~0.08% upward bias per tick (macro trend)
const NOISE_STD = 0.003;       // ~±0.9% typical random change
const MAX_CHANGE_PCT = 0.02;   // cap at ±2% per step

/** Generate new KWH from latest: smooth macro trend with small random updates (no wild bouncing). */
function nextKwhFromLatest(latestKwh: number): bigint {
  if (latestKwh <= 0) return BigInt(0);
  const noise = standardNormal() * NOISE_STD;
  let growth = 1 + DRIFT_PER_STEP + noise;
  growth = Math.max(1 - MAX_CHANGE_PCT, Math.min(1 + MAX_CHANGE_PCT, growth));
  const next = Math.round(latestKwh * growth);
  return BigInt(Math.max(0, next));
}

// --- Legacy sim state (used when BACKEND_URL is not set) ---
let simHour = (Math.floor(Date.now() / 1000 / (SIM_SPEED || 3600)) % 24);
let batterySocBps = 6500;

function nextSimHour(): number {
  simHour = (simHour + 1) % 24;
  return simHour;
}

function dayNightWattHours(): bigint {
  const hour = simHour;
  const base = 400_000;
  const peak = 800_000;
  if (hour >= 6 && hour <= 18) {
    const t = (hour - 6) / 12;
    const curve = Math.sin(t * Math.PI);
    return BigInt(Math.round(base + (peak - base) * curve));
  }
  return BigInt(Math.round(base * 0.1));
}

function nextBatterySocBps(): number {
  const drift = (Math.random() - 0.48) * 200;
  batterySocBps = Math.max(2000, Math.min(9500, batterySocBps + Math.round(drift)));
  return batterySocBps;
}

interface RwaListItem {
  rwa_adi_id: number;
  latest_kwh: number | null;
  latest_ts: string | null;
}

async function fetchRwas(): Promise<RwaListItem[]> {
  if (!BACKEND_URL) return [];
  const base = BACKEND_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/rwas`);
  if (!res.ok) return [];
  const data = (await res.json()) as RwaListItem[];
  return Array.isArray(data) ? data : [];
}

async function publishOnceRwa(
  rwaId: number,
  latestKwh: number,
  nonceOverride?: number
): Promise<number> {
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const wattHours = nextKwhFromLatest(latestKwh);
  const batterySocBps = 0;

  const overrides = nonceOverride !== undefined ? { nonce: nonceOverride } : {};
  const tx = await contract.publish(
    BigInt(rwaId),
    timestamp,
    wattHours,
    batterySocBps,
    overrides
  );
  const receipt = await tx.wait();
  const txHash = receipt?.hash ?? tx.hash;
  console.log(
    JSON.stringify({
      event: "published",
      payload: {
        site_id: rwaId,
        ts: Number(timestamp),
        watt_hours: Number(wattHours),
        battery_soc_bps: batterySocBps,
      },
      tx_hash: txHash,
    })
  );
  return nonceOverride !== undefined ? nonceOverride + 1 : (await provider.getTransactionCount(wallet.address, "pending"));
}

async function publishOnceLegacy(nonceOverride?: number): Promise<void> {
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const wattHours = dayNightWattHours();
  const bps = nextBatterySocBps();
  nextSimHour();

  const payload = {
    siteId: SITE_ID,
    timestamp,
    wattHours,
    batterySocBps: bps,
  };
  const overrides = nonceOverride !== undefined ? { nonce: nonceOverride } : {};
  const tx = await contract.publish(
    payload.siteId,
    payload.timestamp,
    payload.wattHours,
    payload.batterySocBps,
    overrides
  );
  const receipt = await tx.wait();
  console.log(
    JSON.stringify({
      event: "published",
      payload: {
        site_id: Number(SITE_ID),
        ts: Number(timestamp),
        watt_hours: Number(wattHours),
        battery_soc_bps: bps,
      },
      tx_hash: receipt?.hash ?? tx.hash,
    })
  );
}

// Ensure only one publish cycle runs at a time (avoids "existing transaction had higher priority" when interval < confirmation time).
let publishLock: Promise<void> = Promise.resolve();

async function publishOnce(): Promise<void> {
  const rwas = await fetchRwas();
  if (rwas.length > 0) {
    let nonce = await provider.getTransactionCount(wallet.address, "pending");
    for (const r of rwas) {
      const latestKwh = r.latest_kwh ?? 0;
      nonce = await publishOnceRwa(r.rwa_adi_id, latestKwh, nonce);
    }
    return;
  }
  const nonce = await provider.getTransactionCount(wallet.address, "pending");
  await publishOnceLegacy(nonce);
}

async function loop(): Promise<never> {
  let backoff = 1000;
  const maxBackoff = 60_000;
  while (true) {
    const prev = publishLock;
    let resolveLock!: () => void;
    publishLock = new Promise((r) => { resolveLock = r; });
    await prev;
    try {
      await publishOnce();
      backoff = 1000;
    } catch (err) {
      console.error(JSON.stringify({ event: "error", error: String(err) }));
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, maxBackoff);
    } finally {
      resolveLock();
    }
    await new Promise((r) => setTimeout(r, PUBLISH_INTERVAL_MS));
  }
}

loop();
