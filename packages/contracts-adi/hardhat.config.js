require("@nomicfoundation/hardhat-toolbox");

const adiRpcUrl = process.env.ADI_RPC_URL || "https://rpc.ab.testnet.adifoundation.ai/";
const adiPk = process.env.ADI_OPERATOR_PRIVATE_KEY || process.env.HEDERA_OPERATOR_KEY || "";

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
    adiTestnet: {
      url: adiRpcUrl,
      chainId: 99999,
      accounts: adiPk ? [adiPk] : []
    }
  }
};
