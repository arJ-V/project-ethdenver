#!/usr/bin/env node
/**
 * Print the writer address and desk address that trading-api uses.
 * Use this to ensure manual-write-option approves the SAME desk and uses the SAME writer.
 * If writer/desk don't match what you approved, you get ERC20InsufficientAllowance on submit.
 * Run from packages/trading-api: node print-writer-desk.js
 * See docs/HEDERA_E2E_NOTES.md for full alignment notes.
 */
const path = require("path");
const fs = require("fs");
// Same load order as server.js: root then relayer then local (so writer matches manual-write-option)
const rootEnv = path.join(__dirname, "..", "..", ".env");
const relayerEnv = path.join(__dirname, "..", "relayer-python", ".env");
if (fs.existsSync(rootEnv)) require("dotenv").config({ path: rootEnv });
if (fs.existsSync(relayerEnv)) require("dotenv").config({ path: relayerEnv });
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { ethers } = require("ethers");

const manifestPath = path.join(__dirname, "..", "..", "docs", "deployed-addresses.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};
const deskAddress =
  process.env.HEDERA_OPTIONS_DESK_ADDRESS || manifest?.hedera?.optionsDeskAddress || null;
const pk = process.env.WRITER_PRIVATE_KEY || process.env.HEDERA_OPERATOR_KEY;

let writerAddress = null;
if (pk) {
  try {
    const w = new ethers.Wallet(pk);
    writerAddress = w.address;
  } catch (e) {
    writerAddress = "(invalid key)";
  }
}

console.log("trading-api uses:");
console.log("  Writer address:", writerAddress || "(no WRITER_PRIVATE_KEY / HEDERA_OPERATOR_KEY)");
console.log("  Options desk:  ", deskAddress || "(no manifest or HEDERA_OPTIONS_DESK_ADDRESS)");
console.log("");
console.log("To fix ERC20InsufficientAllowance:");
console.log("  1. Use the SAME writer key in trading-api .env as in relayer-python/.env (HEDERA_OPERATOR_KEY).");
console.log("  2. Do NOT set HEDERA_OPTIONS_DESK_ADDRESS in trading-api .env so it uses the manifest desk above.");
console.log("  3. Run: cd packages/contracts-hedera && npx hardhat run scripts/manual-write-option.js --network hederaTestnet");
console.log("     (That approves the manifest desk for the relayer key. If you use a different desk in trading-api .env, set HEDERA_OPTIONS_DESK_ADDRESS and HEDERA_YSOLAR_ADDRESS when running the script so it approves that desk.)");
console.log("");
