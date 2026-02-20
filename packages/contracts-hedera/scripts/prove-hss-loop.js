const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadManifest() {
  const manifestPath = path.join(__dirname, "..", "..", "..", "docs", "deployed-addresses.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing docs/deployed-addresses.json. Deploy contracts first.");
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(fn, label, retries = 5, delayMs = 3000) {
  let lastErr;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await wait(delayMs);
    }
  }
  throw new Error(`${label} failed after retries: ${lastErr?.message || lastErr}`);
}

async function main() {
  const signers = await hre.ethers.getSigners();
  if (!signers.length) {
    throw new Error(
      "No signer loaded for hederaTestnet. Set HEDERA_OPERATOR_KEY in packages/relayer-python/.env."
    );
  }
  const [writer] = signers;
  const manifest = loadManifest();
  const hedera = manifest.hedera;

  if (!hedera?.ySolarAddress || !hedera?.oracleAddress || !hedera?.optionsDeskAddress) {
    throw new Error("Missing Hedera deployment addresses in manifest.");
  }

  const ySolar = await hre.ethers.getContractAt("ySolarToken", hedera.ySolarAddress, writer);
  const oracle = await hre.ethers.getContractAt("YieldOracle", hedera.oracleAddress, writer);
  const desk = await hre.ethers.getContractAt("HederaOptionsDesk", hedera.optionsDeskAddress, writer);

  // For demo speed, writer is also buyer. This keeps the flow single-operator and deterministic.
  const buyer = writer.address;
  const amount = 1_000n;
  const strike = 500n;
  const latestBlock = await retry(
    () => hre.ethers.provider.getBlock("latest"),
    "fetch latest block"
  );
  const expiry = BigInt(latestBlock.timestamp + 220);

  const mintTx = await ySolar.mint(writer.address, amount);
  await mintTx.wait();
  const approveTx = await ySolar.approve(desk.target, amount);
  await approveTx.wait();

  const writeTx = await desk.writeOption(buyer, amount, strike, expiry);
  const writeReceipt = await writeTx.wait();
  const fromBlock = writeReceipt.blockNumber;

  const optionWritten = writeReceipt.logs
    .map((log) => {
      try {
        return desk.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "OptionWritten");

  const optionId = optionWritten?.args?.optionId;
  if (!optionId) {
    throw new Error("OptionWritten event not found.");
  }

  console.log("mintTx:", mintTx.hash);
  console.log("approveTx:", approveTx.hash);
  console.log("writeOptionTx:", writeTx.hash);
  console.log("optionId:", optionId.toString());
  console.log("expiry:", expiry.toString());

  // Push oracle immediately. Freshness checks allow updates in the expiry-300s to expiry window.
  const oracleTx = await retry(() => oracle.pushYieldIndex(700n), "push oracle tx");
  await retry(() => oracleTx.wait(), "wait oracle receipt");
  console.log("oracleTx:", oracleTx.hash);

  // Poll settlement events for up to 3 minutes after expiry.
  const start = Date.now();
  const maxWaitMs = 3 * 60 * 1000;
  while (Date.now() - start < maxWaitMs) {
    const latest = await retry(() => hre.ethers.provider.getBlockNumber(), "get block number", 2, 1500);
    const settled = await retry(
      () => desk.queryFilter(desk.filters.OptionSettled(optionId), fromBlock, latest),
      "query OptionSettled",
      2,
      1500
    );
    const released = await retry(
      () => desk.queryFilter(desk.filters.CollateralReleased(optionId), fromBlock, latest),
      "query CollateralReleased",
      2,
      1500
    );
    const failed = await retry(
      () => desk.queryFilter(desk.filters.SettlementFailed(optionId), fromBlock, latest),
      "query SettlementFailed",
      2,
      1500
    );
    if (settled.length || released.length || failed.length) {
      console.log("settledEvents:", settled.map((e) => e.transactionHash));
      console.log("releasedEvents:", released.map((e) => e.transactionHash));
      console.log("failedEvents:", failed.map((e) => e.transactionHash));
      return;
    }
    await wait(5000);
  }

  // Fallback for unstable testnet scheduling behavior: execute through the contract entrypoint.
  // This preserves settlement correctness when scheduled execution is delayed or dropped.
  const fallbackTx = await desk.executeScheduledSettlement(optionId);
  await fallbackTx.wait();
  console.log("fallbackManualSettlementTx:", fallbackTx.hash);

  const latest = await hre.ethers.provider.getBlockNumber();
  const settled = await desk.queryFilter(desk.filters.OptionSettled(optionId), fromBlock, latest);
  const released = await desk.queryFilter(desk.filters.CollateralReleased(optionId), fromBlock, latest);
  const failed = await desk.queryFilter(desk.filters.SettlementFailed(optionId), fromBlock, latest);
  console.log("settledEvents:", settled.map((e) => e.transactionHash));
  console.log("releasedEvents:", released.map((e) => e.transactionHash));
  console.log("failedEvents:", failed.map((e) => e.transactionHash));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
