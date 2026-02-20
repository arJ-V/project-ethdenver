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
  console.log("=== HSS Proof Loop Script ===");
  console.log("Network:", hre.network.name);
  console.log("");

  const signers = await hre.ethers.getSigners();
  if (!signers.length) {
    throw new Error(
      "No signer loaded for hederaTestnet. Set HEDERA_OPERATOR_KEY in packages/relayer-python/.env."
    );
  }
  const [writer] = signers;
  console.log("Writer address:", writer.address);
  
  const writerBalance = await hre.ethers.provider.getBalance(writer.address);
  console.log("Writer HBAR balance:", hre.ethers.formatEther(writerBalance), "HBAR");
  console.log("");

  console.log("Loading deployment manifest...");
  const manifest = loadManifest();
  const hedera = manifest.hedera;

  if (!hedera?.ySolarAddress || !hedera?.oracleAddress || !hedera?.optionsDeskAddress) {
    throw new Error("Missing Hedera deployment addresses in manifest.");
  }

  console.log("Contract addresses:");
  console.log("  ySolarToken:", hedera.ySolarAddress);
  console.log("  YieldOracle:", hedera.oracleAddress);
  console.log("  HederaOptionsDesk:", hedera.optionsDeskAddress);
  console.log("");

  console.log("Connecting to contracts...");
  const ySolar = await hre.ethers.getContractAt("ySolarToken", hedera.ySolarAddress, writer);
  const oracle = await hre.ethers.getContractAt("YieldOracle", hedera.oracleAddress, writer);
  const desk = await hre.ethers.getContractAt("HederaOptionsDesk", hedera.optionsDeskAddress, writer);
  console.log("✓ Contracts connected");
  console.log("");

  // Check contract HBAR balance for scheduled execution
  console.log("Checking contract HBAR balance...");
  const hasEnoughHbar = await desk.hasSufficientHbar();
  const contractHbarBalance = await hre.ethers.provider.getBalance(desk.target);
  console.log("  Contract HBAR balance:", hre.ethers.formatEther(contractHbarBalance), "HBAR");
  console.log("  Has sufficient HBAR:", hasEnoughHbar);
  
  if (!hasEnoughHbar) {
    console.log("⚠️  Contract needs HBAR for scheduled execution!");
    console.log("Funding contract with 2 HBAR...");
    const fundTx = await writer.sendTransaction({
      to: desk.target,
      value: hre.ethers.parseEther("2.0") // Send 2 HBAR
    });
    console.log("  Funding tx submitted:", fundTx.hash);
    await fundTx.wait();
    console.log("  ✓ Contract funded");
    
    const newBalance = await hre.ethers.provider.getBalance(desk.target);
    console.log("  New contract HBAR balance:", hre.ethers.formatEther(newBalance), "HBAR");
  } else {
    console.log("✓ Contract has sufficient HBAR");
  }
  console.log("");

  // For demo speed, writer is also buyer. This keeps the flow single-operator and deterministic.
  const buyer = writer.address;
  const amount = 1_000n;
  const strike = 500n;
  
  console.log("Preparing option parameters:");
  console.log("  Buyer:", buyer);
  console.log("  Amount:", amount.toString(), "ySOLAR");
  console.log("  Strike:", strike.toString());
  
  console.log("Fetching latest block...");
  const latestBlock = await retry(
    () => hre.ethers.provider.getBlock("latest"),
    "fetch latest block"
  );
  console.log("  Current timestamp:", latestBlock.timestamp.toString());
  console.log("  Current timestamp (human):", new Date(Number(latestBlock.timestamp) * 1000).toISOString());
  
  // Keep expiry short for fast iteration, but add buffer above MIN_EXPIRY to avoid precompile timing races.
  // CRITICAL: expiry must be in Unix epoch SECONDS, not milliseconds
  // latestBlock.timestamp is already in seconds, so we just add 150 seconds
  const expiry = BigInt(latestBlock.timestamp + 150);
  console.log("  Expiry timestamp (seconds):", expiry.toString());
  console.log("  Expiry timestamp (human):", new Date(Number(expiry) * 1000).toISOString());
  console.log("  Seconds from now:", (Number(expiry) - latestBlock.timestamp).toString());
  
  // Verify expiry is reasonable (not in milliseconds)
  const currentTimeSeconds = Math.floor(Date.now() / 1000);
  const expiryAsSeconds = Number(expiry);
  if (expiryAsSeconds > currentTimeSeconds + 86400 * 365) {
    console.log("  ⚠️  WARNING: Expiry looks like it might be in milliseconds!");
    console.log("    Expiry:", expiryAsSeconds);
    console.log("    Current:", currentTimeSeconds);
    console.log("    Difference:", (expiryAsSeconds - currentTimeSeconds), "seconds");
  }
  console.log("");

  console.log("Step 1: Minting ySOLAR tokens to writer...");
  const writerBalanceBefore = await ySolar.balanceOf(writer.address);
  console.log("  Writer balance before:", writerBalanceBefore.toString());
  
  const mintTx = await ySolar.mint(writer.address, amount);
  console.log("  Mint tx submitted:", mintTx.hash);
  await mintTx.wait();
  console.log("  ✓ Tokens minted");
  
  const writerBalanceAfter = await ySolar.balanceOf(writer.address);
  console.log("  Writer balance after:", writerBalanceAfter.toString());
  console.log("");

  console.log("Step 2: Approving desk to spend tokens...");
  const approvalTx = await ySolar.approve(desk.target, amount);
  console.log("  Approval tx submitted:", approvalTx.hash);
  await approvalTx.wait();
  console.log("  ✓ Approval granted");
  
  const allowance = await ySolar.allowance(writer.address, desk.target);
  console.log("  Allowance:", allowance.toString());
  console.log("");

  console.log("Step 3: Writing option...");
  console.log("  Calling writeOption with:");
  console.log("    buyer:", buyer);
  console.log("    amount:", amount.toString());
  console.log("    strike:", strike.toString());
  console.log("    expiry:", expiry.toString());
  console.log("    expiry (human):", new Date(Number(expiry) * 1000).toISOString());
  
  // Verify timestamp is in seconds, not milliseconds (reuse currentTimeSeconds from above)
  const expirySeconds = Number(expiry);
  const timeDiff = expirySeconds - currentTimeSeconds;
  
  console.log("  Timestamp verification:");
  console.log("    Current time (seconds):", currentTimeSeconds);
  console.log("    Expiry time (seconds):", expirySeconds);
  console.log("    Difference:", timeDiff, "seconds");
  
  if (timeDiff < 0) {
    console.log("    ⚠️  WARNING: Expiry is in the past!");
  } else if (timeDiff > 86400 * 365) {
    console.log("    ⚠️  WARNING: Expiry is more than 1 year away - might be in milliseconds!");
    console.log("    If expiry was in milliseconds, it would be:", expirySeconds / 1000, "seconds");
  } else if (timeDiff < 120) {
    console.log("    ⚠️  WARNING: Expiry is less than MIN_EXPIRY (120 seconds)!");
  } else {
    console.log("    ✓ Timestamp looks correct (seconds, not milliseconds)");
  }
  console.log("");
  
  let writeTx;
  let writeReceipt;
  let fromBlock;
  
  // Use staticCall to simulate the transaction and extract the exact HSS error code
  // This bypasses Hedera's JSON-RPC relay data-stripping behavior
  console.log("  Simulating writeOption to extract the exact HSS error code...");
  try {
    // staticCall simulates the transaction without changing state, preserving revert data
    await desk.writeOption.staticCall(buyer, amount, strike, expiry);
    console.log("  ✓ Simulation passed - proceeding with actual transaction...");
  } catch (staticError) {
    console.log("");
    console.log("  🚨 Static call failed - extracting error details:");
    console.log("  Error message:", staticError.message);
    
    if (staticError.data) {
      console.log("  Raw error data:", staticError.data);
      try {
        // Decode the custom error using your contract's ABI
        const decodedError = desk.interface.parseError(staticError.data);
        console.log("");
        console.log("  ✓ Successfully decoded custom error!");
        console.log("  Error name:", decodedError.name);
        console.log("  Error signature:", decodedError.signature);
        
        if (decodedError.name === "HssScheduleFailed") {
          const responseCode = decodedError.args[0];
          console.log("");
          console.log("  🚨 EXACT HSS ERROR CODE:", responseCode.toString());
          console.log("");
          console.log("  Hedera Response Code meanings:");
          console.log("    22 = SUCCESS");
          console.log("    22 = SUCCESS");
          console.log("    161 = SCHEDULE_EXPIRY_IS_BUSY (gas limit too high or schedule conflict)");
          console.log("    162 = SCHEDULE_EXPIRY_TOO_FAR_IN_FUTURE");
          console.log("    165 = INVALID_SCHEDULE_PAYER_ID");
          console.log("    168 = OPERATION_REQUIRES_VALID_PAYER_ACCOUNT");
          console.log("    169 = SCHEDULE_PAYER_ACCOUNT_NOT_AUTHORIZED");
          console.log("    170 = SCHEDULE_ALREADY_EXISTS");
          console.log("    171 = SCHEDULE_ALREADY_DELETED");
          console.log("    172 = SCHEDULE_IS_IMMUTABLE");
          console.log("    205 = NO_NEW_VALID_SIGNATURES (authorizeSchedule redundant - schedule already signed)");
          console.log("");
          
          const codeNum = Number(responseCode);
          if (codeNum === 161) {
            console.log("  💡 SOLUTION: Reduce SCHEDULE_GAS_LIMIT from 1,200,000 to 800,000-1,000,000");
            console.log("     (Already reduced to 800,000 in contract)");
          } else if (codeNum === 205) {
            console.log("  💡 SOLUTION: Error code 205 = NO_NEW_VALID_SIGNATURES");
            console.log("     Root cause: authorizeSchedule() is redundant when contract is payer");
            console.log("     Fix: Remove authorizeSchedule() call - schedule is auto-signed");
            console.log("     (Contract has been updated to remove redundant authorization)");
          } else if (codeNum === 168 || codeNum === 169) {
            console.log("  💡 SOLUTION: Contract payer account authorization issue - check HBAR balance");
          } else if (codeNum === 171) {
            console.log("  💡 SOLUTION: Code 171 = SCHEDULE_ALREADY_DELETED");
          }
        } else {
          console.log("  Error args:", decodedError.args);
        }
      } catch (parseError) {
        console.log("  Could not parse error:", parseError.message);
        console.log("  This might be a standard EVM revert without custom error data");
      }
    } else {
      console.log("  ⚠️  No error data available - relay stripped it even from staticCall");
      console.log("  This suggests a deeper issue with the transaction");
    }
    console.log("");
    console.log("  Since simulation failed, the actual transaction will also fail.");
    console.log("  Fix the issue above before proceeding.");
    throw staticError;
  }
  
  try {
    // Use high gas limit to ensure transaction doesn't fail due to gas estimation issues
    // The actual scheduled execution uses SCHEDULE_GAS_LIMIT (1,200,000) which is set in the contract
    writeTx = await desk.writeOption(buyer, amount, strike, expiry, { gasLimit: 3_000_000 });
    console.log("  WriteOption tx submitted:", writeTx.hash);
    console.log("  Waiting for confirmation...");
    
    writeReceipt = await writeTx.wait();
    console.log("  ✓ Transaction confirmed");
    console.log("  Block number:", writeReceipt.blockNumber);
    console.log("  Gas used:", writeReceipt.gasUsed.toString());
    fromBlock = writeReceipt.blockNumber;
  } catch (error) {
    console.log("");
    console.log("❌ Error writing option:");
    console.log("  Error message:", error.message);
    console.log("  Error code:", error.code);
    
    // Try to decode custom error
    if (error.data) {
      console.log("");
      console.log("  Attempting to decode error data...");
      console.log("  Raw error data:", error.data);
      
      try {
        // Try to parse as custom error
        const decodedError = desk.interface.parseError(error.data);
        console.log("  ✓ Decoded custom error:");
        console.log("    Error name:", decodedError.name);
        console.log("    Error signature:", decodedError.signature);
        
        if (decodedError.name === "HssScheduleFailed") {
          const responseCode = decodedError.args[0];
          console.log("    Hedera Response Code:", responseCode.toString());
          console.log("");
          console.log("  Hedera Response Code meanings:");
          console.log("    22 = SUCCESS");
          console.log("    161 = SCHEDULE_EXPIRY_IS_BUSY (gas limit too high or schedule conflict)");
          console.log("    162 = SCHEDULE_EXPIRY_TOO_FAR_IN_FUTURE");
          console.log("    163 = INVALID_SCHEDULE_ID");
          console.log("    164 = SCHEDULE_ALREADY_DELETED");
          console.log("    165 = INVALID_SCHEDULE_PAYER_ID");
          console.log("    166 = SCHEDULE_ALREADY_EXECUTED");
          console.log("    167 = MESSAGE_SIZE_TOO_LARGE");
          console.log("    168 = OPERATION_REQUIRES_VALID_PAYER_ACCOUNT");
          console.log("    169 = SCHEDULE_PAYER_ACCOUNT_NOT_AUTHORIZED");
          console.log("    170 = SCHEDULE_ALREADY_EXISTS");
          console.log("    171 = INVALID_SCHEDULE_ID");
          console.log("    172 = SCHEDULE_IS_IMMUTABLE");
          console.log("    173 = INVALID_SCHEDULE_ID");
          console.log("    174 = SCHEDULE_ALREADY_DELETED");
          console.log("    175 = SCHEDULE_ALREADY_EXECUTED");
          console.log("    176 = INVALID_SCHEDULE_ID");
          console.log("    177 = SCHEDULE_ALREADY_EXECUTED");
          console.log("    178 = SCHEDULE_ALREADY_DELETED");
          console.log("    179 = INVALID_SCHEDULE_ID");
          console.log("    180 = SCHEDULE_ALREADY_EXECUTED");
          console.log("    181 = SCHEDULE_ALREADY_DELETED");
          console.log("    182 = INVALID_SCHEDULE_ID");
          console.log("    183 = SCHEDULE_ALREADY_EXECUTED");
          console.log("    184 = SCHEDULE_ALREADY_DELETED");
          console.log("    185 = INVALID_SCHEDULE_ID");
          console.log("    186 = SCHEDULE_ALREADY_EXECUTED");
          console.log("    187 = SCHEDULE_ALREADY_DELETED");
          console.log("    188 = INVALID_SCHEDULE_ID");
          console.log("    189 = SCHEDULE_ALREADY_EXECUTED");
          console.log("    190 = SCHEDULE_ALREADY_DELETED");
          console.log("");
          console.log("  Most likely issues:");
          if (Number(responseCode) === 161) {
            console.log("    → SCHEDULE_EXPIRY_IS_BUSY: Try reducing SCHEDULE_GAS_LIMIT");
          } else if (Number(responseCode) === 162) {
            console.log("    → SCHEDULE_EXPIRY_TOO_FAR_IN_FUTURE: Check timestamp format (should be seconds, not milliseconds)");
          } else if (Number(responseCode) === 168) {
            console.log("    → OPERATION_REQUIRES_VALID_PAYER_ACCOUNT: Contract payer account issue");
          } else if (Number(responseCode) === 169) {
            console.log("    → SCHEDULE_PAYER_ACCOUNT_NOT_AUTHORIZED: Contract needs authorization as payer");
          }
        } else {
          console.log("    Error args:", decodedError.args);
        }
      } catch (parseError) {
        console.log("  Could not parse as custom error:", parseError.message);
        console.log("  This might be a standard EVM revert. Check Hashscan for details.");
      }
    }
    
    if (error.reason) {
      console.log("  Reason:", error.reason);
    }
    if (error.transaction) {
      console.log("  Transaction:", error.transaction);
    }
    if (error.receipt) {
      console.log("  Receipt:", error.receipt);
    }
    
    console.log("");
    console.log("Debugging checklist:");
    console.log("  1. Verify expiry is in seconds (not milliseconds):", expiry.toString());
    
    // Check contract HBAR balance
    const contractBalance = await hre.ethers.provider.getBalance(desk.target);
    const contractBalanceHbar = hre.ethers.formatEther(contractBalance);
    console.log("  2. Contract HBAR balance:", contractBalance.toString(), "tinybars", `(${contractBalanceHbar} HBAR)`);
    const minRequired = await desk.MIN_HBAR_BALANCE();
    console.log("     Minimum required:", minRequired.toString(), "tinybars", `(${hre.ethers.formatEther(minRequired)} HBAR)`);
    if (contractBalance < minRequired) {
      console.log("     ⚠️  Contract needs more HBAR!");
    } else {
      console.log("     ✓ Contract has sufficient HBAR");
    }
    
    // Check SCHEDULE_GAS_LIMIT
    const scheduleGasLimit = await desk.SCHEDULE_GAS_LIMIT();
    console.log("  3. SCHEDULE_GAS_LIMIT:", scheduleGasLimit.toString());
    if (Number(scheduleGasLimit) >= 1_200_000) {
      console.log("     ⚠️  Gas limit is high - if error code is 161, try reducing to 800,000-1,000,000");
    }
    
    console.log("  4. Check if scheduleCallWithPayer exists on this Hedera version");
    console.log("  5. Verify contract address is valid payer:", desk.target);
    
    throw error;
  }

  console.log("  Parsing events from transaction...");
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

  console.log("  ✓ Events parsed successfully");
  console.log("");
  console.log("=== Option Created ===");
  console.log("Option ID:", optionId.toString());
  console.log("Schedule Ref:", scheduleRef.toString());
  console.log("Expiry:", expiry.toString(), `(${new Date(Number(expiry) * 1000).toISOString()})`);
  console.log("");
  
  // Check token balances
  const writerBalanceFinal = await ySolar.balanceOf(writer.address);
  const deskBalance = await ySolar.balanceOf(desk.target);
  console.log("Token balances after option creation:");
  console.log("  Writer ySOLAR:", writerBalanceFinal.toString());
  console.log("  Desk ySOLAR:", deskBalance.toString());
  console.log("");

  // Push oracle immediately. Freshness checks allow updates in the expiry-300s to expiry window.
  console.log("Step 4: Pushing oracle yield index...");
  const yieldIndex = 700n;
  console.log("  Yield index:", yieldIndex.toString());
  
  const oracleTx = await retry(() => oracle.pushYieldIndex(yieldIndex), "push oracle tx");
  console.log("  Oracle tx submitted:", oracleTx.hash);
  await retry(() => oracleTx.wait(), "wait oracle receipt");
  console.log("  ✓ Oracle updated");
  
  const oracleData = await oracle.getLatest();
  console.log("  Oracle data:", {
    yieldIndex: oracleData[0].toString(),
    updatedAt: oracleData[1].toString(),
    roundId: oracleData[2].toString()
  });
  console.log("");

  console.log("Step 5: Checking option state before settlement...");
  const optionBefore = await desk.options(optionId);
  const oracleBefore = await oracle.getLatest();
  const deskBalBefore = await ySolar.balanceOf(desk.target);
  const latestBefore = await hre.ethers.provider.getBlock("latest");
  
  console.log("Option state:");
  console.log("  Writer:", optionBefore.writer);
  console.log("  Buyer:", optionBefore.buyer);
  console.log("  Amount:", optionBefore.amount.toString());
  console.log("  Strike:", optionBefore.strike.toString());
  console.log("  Expiry:", optionBefore.expiry.toString(), `(${new Date(Number(optionBefore.expiry) * 1000).toISOString()})`);
  console.log("  Status:", optionBefore.status.toString(), "(0=None, 1=Written, 2=Settled, 3=Slashed)");
  console.log("  Schedule Ref:", optionBefore.scheduleRef.toString());
  
  console.log("Oracle state:");
  console.log("  Yield Index:", oracleBefore[0].toString());
  console.log("  Updated At:", oracleBefore[1].toString(), `(${new Date(Number(oracleBefore[1]) * 1000).toISOString()})`);
  console.log("  Round ID:", oracleBefore[2].toString());
  console.log("  Current timestamp:", latestBefore.timestamp.toString(), `(${new Date(Number(latestBefore.timestamp) * 1000).toISOString()})`);
  
  console.log("Desk balance:", deskBalBefore.toString(), "ySOLAR");
  
  const timeUntilExpiry = Number(optionBefore.expiry) - latestBefore.timestamp;
  console.log("  Time until expiry:", timeUntilExpiry, "seconds");
  console.log("");

  // Poll settlement events for up to 4 minutes to keep debug loops fast.
  console.log("Step 6: Waiting for scheduled settlement execution...");
  console.log("  This may take up to 4 minutes (or until expiry + execution time)");
  console.log("  Polling for settlement events...");
  console.log("");
  
  const start = Date.now();
  const maxWaitMs = 4 * 60 * 1000;
  let pollCount = 0;
  
  while (Date.now() - start < maxWaitMs) {
    pollCount++;
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (pollCount % 6 === 0) { // Log every 30 seconds (6 * 5 second intervals)
      console.log(`  [${elapsed}s] Still waiting... (poll #${pollCount})`);
    }
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
      console.log("");
      console.log("=== Settlement Events Detected ===");
      console.log("Total events found:", settled.length + released.length + failed.length + attempts.length + details.length);
      console.log("");
      
      if (settled.length > 0) {
        console.log("✓ OptionSettled events:", settled.length);
        settled.forEach((e, i) => {
          console.log(`  Event ${i + 1}:`, e.transactionHash);
        });
      }
      
      if (released.length > 0) {
        console.log("✓ CollateralReleased events:", released.length);
        released.forEach((e, i) => {
          console.log(`  Event ${i + 1}:`, e.transactionHash);
        });
      }
      
      if (failed.length > 0) {
        console.log("⚠ SettlementFailed events:", failed.length);
        failed.forEach((e, i) => {
          console.log(`  Event ${i + 1}:`, e.transactionHash);
          console.log(`    Reason:`, e.args.reason);
          console.log(`    Oracle Round ID:`, e.args.oracleRoundId.toString());
          console.log(`    Oracle Updated At:`, e.args.oracleUpdatedAt.toString());
        });
      }
      
      if (attempts.length > 0) {
        console.log("ℹ SettlementExecutionAttempt events:", attempts.length);
        attempts.forEach((e, i) => {
          console.log(`  Attempt ${i + 1}:`);
          console.log(`    TX:`, e.transactionHash);
          console.log(`    Caller:`, e.args.caller);
          console.log(`    Block Timestamp:`, e.args.blockTs.toString(), `(${new Date(Number(e.args.blockTs) * 1000).toISOString()})`);
          console.log(`    Option Expiry:`, e.args.optionExpiry.toString(), `(${new Date(Number(e.args.optionExpiry) * 1000).toISOString()})`);
          console.log(`    Option Status:`, e.args.optionStatus.toString());
          console.log(`    Oracle Yield Index:`, e.args.oracleYieldIndex.toString());
          console.log(`    Oracle Round ID:`, e.args.oracleRoundId.toString());
          console.log(`    Oracle Updated At:`, e.args.oracleUpdatedAt.toString());
          console.log(`    Desk Balance:`, e.args.deskBalance.toString(), "ySOLAR");
          console.log(`    Payout Preview:`, e.args.payoutPreview.toString(), "ySOLAR");
        });
      }
      
      if (details.length > 0) {
        console.log("ℹ SettlementFailureDetail events:", details.length);
        details.forEach((e, i) => {
          const selector = ev.args.errorSelector;
          console.log(`  Detail ${i + 1}:`);
          console.log(`    TX:`, e.transactionHash);
          console.log(`    Selector:`, selector);
          console.log(`    Decoded Reason:`, e.args.decodedReason);
          console.log(`    Selector Label:`, selectorToReason(selector));
          console.log(`    Revert Data Size:`, e.args.revertData.length / 2 - 1, "bytes");
        });
      }
      console.log("");
      console.log("=== Final State ===");
      const optionAfter = await desk.options(optionId);
      const oracleAfter = await oracle.getLatest();
      const deskBalAfter = await ySolar.balanceOf(desk.target);
      const latestAfter = await hre.ethers.provider.getBlock("latest");
      
      console.log("Option state:");
      console.log("  Amount:", optionAfter.amount.toString());
      console.log("  Strike:", optionAfter.strike.toString());
      console.log("  Expiry:", optionAfter.expiry.toString(), `(${new Date(Number(optionAfter.expiry) * 1000).toISOString()})`);
      console.log("  Status:", optionAfter.status.toString(), "(0=None, 1=Written, 2=Settled, 3=Slashed)");
      
      console.log("Oracle state:");
      console.log("  Yield Index:", oracleAfter[0].toString());
      console.log("  Updated At:", oracleAfter[1].toString(), `(${new Date(Number(oracleAfter[1]) * 1000).toISOString()})`);
      console.log("  Round ID:", oracleAfter[2].toString());
      console.log("  Current timestamp:", latestAfter.timestamp.toString(), `(${new Date(Number(latestAfter.timestamp) * 1000).toISOString()})`);
      
      console.log("Desk balance:", deskBalAfter.toString(), "ySOLAR");
      
      // Check final balances
      const writerFinalBalance = await ySolar.balanceOf(writer.address);
      const buyerFinalBalance = await ySolar.balanceOf(buyer);
      console.log("Final token balances:");
      console.log("  Writer ySOLAR:", writerFinalBalance.toString());
      console.log("  Buyer ySOLAR:", buyerFinalBalance.toString());
      console.log("  Desk ySOLAR:", deskBalAfter.toString());
      
      console.log("");
      console.log("=== Test Complete ===");
      return;
    }
    await wait(5000);
  }
  
  console.log("");
  console.log("⚠️  Timeout waiting for autonomous HSS settlement");
  console.log("  Option ID:", optionId.toString());
  console.log("  Schedule Ref:", scheduleRef.toString());
  console.log("  Waited:", Math.floor((Date.now() - start) / 1000), "seconds");
  console.log("");
  console.log("Note: HSS scheduled execution may take longer on testnet.");
  console.log("You can manually trigger settlement by calling executeScheduledSettlement()");
  
  throw new Error(
    `Timed out waiting for autonomous HSS settlement. optionId=${optionId.toString()} scheduleRef=${scheduleRef.toString()}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
