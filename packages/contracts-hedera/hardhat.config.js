require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const fs = require("fs");

// Load env from multiple locations (first wins): root .env, then relayer-python/.env
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
const rootEnv = path.join(__dirname, "..", "..", ".env");
const relayerEnv = path.join(__dirname, "..", "relayer-python", ".env");
loadEnv(rootEnv);
loadEnv(relayerEnv);

const hederaRpcUrl = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
const hederaPk = process.env.HEDERA_OPERATOR_KEY || process.env.WRITER_PRIVATE_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hederaTestnet: {
      url: hederaRpcUrl,
      chainId: 296,
      accounts: hederaPk ? [hederaPk] : []
    }
  }
};
