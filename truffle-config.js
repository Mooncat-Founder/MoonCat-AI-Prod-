const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

module.exports = {
  networks: {
    base_sepolia: {  // Rename to base_sepolia to match the network
      provider: () => new HDWalletProvider({
        privateKeys: [privateKey],
        providerOrUrl: `https://base-sepolia.g.alchemy.com/v2/${alchemyApiKey}`,  // Correct Base Sepolia URL
        pollingInterval: 4000 
      }),
      network_id: 84532,  // Base Sepolia's network ID
      gas: 8000000,          // Adjust based on actual usage
//      gasPrice: 5000000000,  // Example gas price (5 Gwei), modify if needed
      confirmations: 2,      // Wait for 2 confirmations
      timeoutBlocks: 10000,    // Timeout for blocks
      networkCheckTimeout: 14400000,  // Network check timeout
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
