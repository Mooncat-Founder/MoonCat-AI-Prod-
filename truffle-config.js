const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

module.exports = {
  networks: {
    uni_sepolia: {
      provider: () => new HDWalletProvider({
        privateKeys: [privateKey],
        providerOrUrl: `https://unichain-sepolia.g.alchemy.com/v2/${alchemyApiKey}`,
        pollingInterval: 4000,
      }),
      network_id: 1301,
      confirmations: 2,
      timeoutBlocks: 10000,
      networkCheckTimeout: 14400000,
      skipDryRun: true,
      gasPrice: undefined, // Let the network decide
      gas: 6000000,       // Gas limit
      maxFeePerGas: undefined, // For EIP-1559
      maxPriorityFeePerGas: undefined // For EIP-1559
    },
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    }
  },
  plugins: ['truffle-plugin-verify'],
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY || ''
  },
  compilers: {
    solc: {
      version: "0.8.27",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "paris" // Specify EVM version for compatibility
      }
    }
  },
  mocha: {
    timeout: 100000
  }
};
