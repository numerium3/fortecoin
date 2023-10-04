import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    mainnet: {
      url: process.env.ETHEREUM_RPC!,
      accounts: [process.env.PRIVATE_KEY!]
    },
    avalanche: {
      url: process.env.AVALANCHE_RPC!,
      accounts: [process.env.PRIVATE_KEY!]
    },
    polygon: {
      url: process.env.POLYGON_RPC!,
      accounts: [process.env.PRIVATE_KEY!]
    },
    goerli: {
      url: process.env.GOERLI_RPC!,
      accounts: [process.env.PRIVATE_KEY!]
    }
  },
  etherscan: {
    apiKey: {
        mainnet: process.env.ETHERSCAN_ETHEREUM_API_KEY!,
        goerli: process.env.ETHERSCAN_GOERLI_API_KEY!,
        polygon: process.env.ETHERSCAN_POLYGON_API_KEY!,
        avalanche: process.env.ETHERSCAN_AVALANCHE_API_KEY!,
    }
  }
};

export default config;
