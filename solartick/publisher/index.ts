import { Contract, Wallet, JsonRpcProvider } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const PUBLISHER_PRIVATE_KEY = process.env.PUBLISHER_PRIVATE_KEY!;
const TELEMETRY_CONTRACT_ADDRESS = process.env.TELEMETRY_CONTRACT_ADDRESS!;
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

// Sim state: sim hour 0..23, battery SOC 0..10000 bps with drift
let simHour = (Math.floor(Date.now() / 1000 / (SIM_SPEED || 3600)) % 24);
let batterySocBps = 6500; // 65%

function nextSimHour(): number {
  simHour = (simHour + 1) % 24;
  return simHour;
}

function dayNightWattHours(): bigint {
  // Higher production mid-day (hours 10-16), lower at night
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

async function publishOnce(): Promise<void> {
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
  const tx = await contract.publish(payload.siteId, payload.timestamp, payload.wattHours, payload.batterySocBps);
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

async function loop(): Promise<never> {
  let backoff = 1000;
  const maxBackoff = 60_000;
  while (true) {
    try {
      await publishOnce();
      backoff = 1000;
    } catch (err) {
      console.error(JSON.stringify({ event: "error", error: String(err) }));
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, maxBackoff);
      continue;
    }
    await new Promise((r) => setTimeout(r, PUBLISH_INTERVAL_MS));
  }
}

loop();
