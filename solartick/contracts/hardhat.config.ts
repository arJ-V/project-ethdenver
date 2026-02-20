import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const MONAD_RPC_URL = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PUBLISHER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: "0.8.19",
  networks: {
    monadTestnet: {
      url: MONAD_RPC_URL,
      chainId: 10143,
      accounts: DEPLOYER_PRIVATE_KEY.startsWith("0x") ? [DEPLOYER_PRIVATE_KEY] : [`0x${DEPLOYER_PRIVATE_KEY}`],
    },
  },
  defaultNetwork: "monadTestnet",
};

export default config;
