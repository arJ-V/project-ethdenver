const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function loadEnvFrom(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function main() {
  const envPath = path.join(__dirname, "..", "packages", "relayer-python", ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing packages/relayer-python/.env");
  }
  loadEnvFrom(envPath);

  const adiRpc = req("ADI_RPC_URL");
  const hederaRpc = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
  const operatorKey = process.env.ADI_OPERATOR_PRIVATE_KEY || req("HEDERA_OPERATOR_KEY");
  const operatorId = req("HEDERA_OPERATOR_ID");

  const adiProvider = new ethers.JsonRpcProvider(adiRpc);
  const hederaProvider = new ethers.JsonRpcProvider(hederaRpc);
  const wallet = new ethers.Wallet(operatorKey);

  const [adiChainId, hederaChainId, adiBalance, hederaBalance] = await Promise.all([
    adiProvider.getNetwork().then((n) => Number(n.chainId)),
    hederaProvider.getNetwork().then((n) => Number(n.chainId)),
    adiProvider.getBalance(wallet.address),
    hederaProvider.getBalance(wallet.address),
  ]);

  console.log("Preflight summary");
  console.log("----------------");
  console.log("Hedera operator ID:", operatorId);
  console.log("Operator EVM address (ADI deploy key):", wallet.address);
  console.log("ADI chainId:", adiChainId, "balance(wei):", adiBalance.toString());
  console.log("Hedera chainId:", hederaChainId, "balance(wei):", hederaBalance.toString());

  if (adiBalance === 0n) {
    console.log("BLOCKER: ADI deployer balance is zero. Fund this address on ADI testnet.");
  } else {
    console.log("ADI funding: OK");
  }

  if (hederaBalance === 0n) {
    console.log("BLOCKER: Hedera deployer balance is zero.");
  } else {
    console.log("Hedera funding: OK");
  }
}

main().catch((err) => {
  console.error("Preflight failed:", err.message);
  process.exitCode = 1;
});
