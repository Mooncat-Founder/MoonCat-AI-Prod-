const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

module.exports = {
  networks: {
    sepolia: {
      provider: () => new HDWalletProvider({
        privateKeys: [privateKey],
        providerOrUrl: `wss://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`  // Ensure Sepolia is used, not mainnet
      }),
      network_id: 11155111,  // Sepolia's network ID
      gas: 7000000,          // Custom gas limit (adjust as necessary)
      // gasPrice: 50000000000,  // Custom gas price (50 Gwei) - Uncomment if necessary
      confirmations: 2,      // Wait for 2 confirmations
      timeoutBlocks: 200,    // Timeout for blocks
      networkCheckTimeout: 10000,  // Network check timeout
      skipDryRun: true       // Skip dry run before migrations
    }
  },
  compilers: {
    solc: {
      version: "0.8.27",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
