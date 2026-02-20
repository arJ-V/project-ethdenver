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

function selectorToReason(selector) {
  const map = {
    "0x8dc8f0f5": "InvalidBuyer",
    "0xa0bfc4f5": "InvalidAmount",
    "0xa3a6fd7e": "InvalidExpiry",
    "0xc11bf4e3": "InvalidStatus",
    "0x3d693ada": "UnauthorizedSettler",
    "0x7894efdb": "OptionNotExpired",
    "0x90b8ec18": "TransferFailed",
    "0x73a3f9d9": "OracleNotInitialized",
    "0xf97f892f": "OracleStale",
    "0x02ce4d84": "OracleTooFuture",
    "0x4f6fbe66": "OracleWindowMiss",
    "0x199b5648": "HssScheduleFailed",
    "0x4e487b71": "Panic(uint256)",
    "0x08c379a0": "Error(string)"
  };
  return map[(selector || "").toLowerCase()] || "UnknownRevert";
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
  // Keep expiry short for fast iteration, but add buffer above MIN_EXPIRY to avoid precompile timing races.
  const expiry = BigInt(latestBlock.timestamp + 150);

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
  const settlementScheduled = writeReceipt.logs
    .map((log) => {
      try {
        return desk.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "SettlementScheduled");

  const optionId = optionWritten?.args?.optionId;
  if (!optionId) {
    throw new Error("OptionWritten event not found.");
  }
  const scheduleRef = settlementScheduled?.args?.scheduleRef;
  if (!scheduleRef) {
    throw new Error("SettlementScheduled event not found.");
  }

  console.log("mintTx:", mintTx.hash);
  console.log("approveTx:", approveTx.hash);
  console.log("writeOptionTx:", writeTx.hash);
  console.log("optionId:", optionId.toString());
  console.log("expiry:", expiry.toString());
  console.log("scheduleRef:", scheduleRef.toString());

  // Push oracle immediately. Freshness checks allow updates in the expiry-300s to expiry window.
  const oracleTx = await retry(() => oracle.pushYieldIndex(700n), "push oracle tx");
  await retry(() => oracleTx.wait(), "wait oracle receipt");
  console.log("oracleTx:", oracleTx.hash);

  const optionBefore = await desk.options(optionId);
  const oracleBefore = await oracle.getLatest();
  const deskBalBefore = await ySolar.balanceOf(desk.target);
  const latestBefore = await hre.ethers.provider.getBlock("latest");
  console.log("debug.optionBefore:", {
    writer: optionBefore.writer,
    buyer: optionBefore.buyer,
    amount: optionBefore.amount.toString(),
    strike: optionBefore.strike.toString(),
    expiry: optionBefore.expiry.toString(),
    status: optionBefore.status.toString()
  });
  console.log("debug.oracleBefore:", {
    yieldIndex: oracleBefore[0].toString(),
    updatedAt: oracleBefore[1].toString(),
    roundId: oracleBefore[2].toString(),
    nowTs: latestBefore.timestamp
  });
  console.log("debug.deskBalanceBefore:", deskBalBefore.toString());

  // Poll settlement events for up to 4 minutes to keep debug loops fast.
  const start = Date.now();
  const maxWaitMs = 4 * 60 * 1000;
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
    const attempts = await retry(
      () => desk.queryFilter(desk.filters.SettlementExecutionAttempt(optionId), fromBlock, latest),
      "query SettlementExecutionAttempt",
      2,
      1500
    );
    const details = await retry(
      () => desk.queryFilter(desk.filters.SettlementFailureDetail(optionId), fromBlock, latest),
      "query SettlementFailureDetail",
      2,
      1500
    );
    if (settled.length || released.length || failed.length || attempts.length || details.length) {
      console.log("settledEvents:", settled.map((e) => e.transactionHash));
      console.log("releasedEvents:", released.map((e) => e.transactionHash));
      console.log("failedEvents:", failed.map((e) => e.transactionHash));
      for (const ev of failed) {
        console.log("failedEventDetail:", {
          tx: ev.transactionHash,
          reason: ev.args.reason,
          oracleRoundId: ev.args.oracleRoundId.toString(),
          oracleUpdatedAt: ev.args.oracleUpdatedAt.toString()
        });
      }
      for (const ev of attempts) {
        console.log("executionAttempt:", {
          tx: ev.transactionHash,
          caller: ev.args.caller,
          blockTs: ev.args.blockTs.toString(),
          optionExpiry: ev.args.optionExpiry.toString(),
          optionStatus: ev.args.optionStatus.toString(),
          oracleYieldIndex: ev.args.oracleYieldIndex.toString(),
          oracleRoundId: ev.args.oracleRoundId.toString(),
          oracleUpdatedAt: ev.args.oracleUpdatedAt.toString(),
          deskBalance: ev.args.deskBalance.toString(),
          payoutPreview: ev.args.payoutPreview.toString()
        });
      }
      for (const ev of details) {
        const selector = ev.args.errorSelector;
        console.log("failureDetail:", {
          tx: ev.transactionHash,
          selector,
          decodedReason: ev.args.decodedReason,
          selectorLabel: selectorToReason(selector),
          revertDataBytes: ev.args.revertData.length / 2 - 1
        });
      }
      const optionAfter = await desk.options(optionId);
      const oracleAfter = await oracle.getLatest();
      const deskBalAfter = await ySolar.balanceOf(desk.target);
      const latestAfter = await hre.ethers.provider.getBlock("latest");
      console.log("debug.optionAfter:", {
        amount: optionAfter.amount.toString(),
        strike: optionAfter.strike.toString(),
        expiry: optionAfter.expiry.toString(),
        status: optionAfter.status.toString()
      });
      console.log("debug.oracleAfter:", {
        yieldIndex: oracleAfter[0].toString(),
        updatedAt: oracleAfter[1].toString(),
        roundId: oracleAfter[2].toString(),
        nowTs: latestAfter.timestamp
      });
      console.log("debug.deskBalanceAfter:", deskBalAfter.toString());
      return;
    }
    await wait(5000);
  }
  throw new Error(
    `Timed out waiting for autonomous HSS settlement. optionId=${optionId.toString()} scheduleRef=${scheduleRef.toString()}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
