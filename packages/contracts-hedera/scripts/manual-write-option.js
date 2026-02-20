/**
 * Manual writeOption: mint (if minter), approve, writeOption on Hedera testnet.
 * Uses HEDERA_OPERATOR_KEY or WRITER_PRIVATE_KEY from root .env or relayer-python/.env.
 * Addresses from docs/deployed-addresses.json, or override with env:
 *   HEDERA_YSOLAR_ADDRESS, HEDERA_OPTIONS_DESK_ADDRESS, HEDERA_ORACLE_ADDRESS
 *
 * Run: npx hardhat run scripts/manual-write-option.js --network hederaTestnet
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadManifest() {
  const manifestPath = path.join(__dirname, "..", "..", "..", "docs", "deployed-addresses.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing docs/deployed-addresses.json");
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

async function main() {
  console.log("=== Manual writeOption (Hedera testnet) ===\n");

  const signers = await hre.ethers.getSigners();
  if (!signers.length) {
    throw new Error(
      "No signer. Set HEDERA_OPERATOR_KEY or WRITER_PRIVATE_KEY in .env (root or packages/relayer-python/.env)."
    );
  }
  const writer = signers[0];
  console.log("Writer (signer):", writer.address);

  const manifest = loadManifest();
  const hedera = manifest.hedera || {};
  // Use env overrides only when BOTH ySOLAR and desk are set (same deployment); else use manifest for both so token and desk match.
  const envYSolar = process.env.HEDERA_YSOLAR_ADDRESS;
  const envDesk = process.env.HEDERA_OPTIONS_DESK_ADDRESS;
  const ySolarAddress = envYSolar && envDesk ? envYSolar : hedera.ySolarAddress;
  const deskAddress = envYSolar && envDesk ? envDesk : hedera.optionsDeskAddress;

  if (!ySolarAddress || !deskAddress) {
    throw new Error("Need docs/deployed-addresses.json with ySolarAddress and optionsDeskAddress, or set both HEDERA_YSOLAR_ADDRESS and HEDERA_OPTIONS_DESK_ADDRESS");
  }

  console.log("ySOLAR:", ySolarAddress);
  console.log("OptionsDesk:", deskAddress);
  console.log("");

  const ySolar = await hre.ethers.getContractAt("ySolarToken", ySolarAddress, writer);
  const desk = await hre.ethers.getContractAt("HederaOptionsDesk", deskAddress, writer);

  const amount = 100n;
  const strike = 50n;
  const buyer = writer.address; // self for demo
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const expiry = BigInt(latestBlock.timestamp + 200);

  console.log("Option: amount=" + amount + ", strike=" + strike + ", expiry=" + expiry + " (now+200s)");
  console.log("");

  const balanceBefore = await ySolar.balanceOf(writer.address);
  const allowanceBefore = await ySolar.allowance(writer.address, deskAddress);
  console.log("Writer ySOLAR balance:", balanceBefore.toString());
  console.log("Writer allowance for desk:", allowanceBefore.toString());

  if (balanceBefore < amount) {
    console.log("Minting", amount.toString(), "ySOLAR to writer...");
    try {
      const mintTx = await ySolar.mint(writer.address, amount);
      await mintTx.wait();
      console.log("  Mint tx:", mintTx.hash);
    } catch (e) {
      console.error("  Mint failed (writer may need MINTER_ROLE):", e.message);
      throw e;
    }
  }

  const approveAmount = 10_000n; // approve once for many submissions
  if (allowanceBefore < amount) {
    console.log("Approving desk to spend", approveAmount.toString(), "ySOLAR...");
    const approveTx = await ySolar.approve(deskAddress, approveAmount);
    await approveTx.wait();
    console.log("  Approve tx:", approveTx.hash);
  }

  const hasHbar = await desk.hasSufficientHbar();
  if (!hasHbar) {
    console.log("Desk has low HBAR; sending 1 HBAR for schedule execution...");
    const fundTx = await writer.sendTransaction({ to: deskAddress, value: hre.ethers.parseEther("1.0") });
    await fundTx.wait();
    console.log("  Fund tx:", fundTx.hash);
  }

  console.log("Calling writeOption...");
  const writeTx = await desk.writeOption(buyer, amount, strike, expiry, { gasLimit: 3_000_000 });
  const receipt = await writeTx.wait();
  console.log("  writeOption tx:", writeTx.hash);
  console.log("  Block:", receipt.blockNumber);
  console.log("\nDone. Option written successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
