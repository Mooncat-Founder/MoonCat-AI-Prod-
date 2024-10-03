const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

module.exports = {
  networks: {
    base_sepolia: {
      provider: () => new HDWalletProvider({
        privateKeys: [privateKey],
        providerOrUrl: `https://base-sepolia.g.alchemy.com/v2/${alchemyApiKey}`,
        pollingInterval: 4000,
      }),
      network_id: 84532,  // Base Sepolia's network ID
      confirmations: 2,  // Wait for 2 confirmations
      timeoutBlocks: 10000,  // Timeout for blocks
      networkCheckTimeout: 14400000,  // Network check timeout
      skipDryRun: true  // Skip dry run before migrations
    }
  },
  plugins: [
    'truffle-plugin-verify'  // Ensure this is added to enable verification
  ],
  api_keys: {
    etherscan: ''  // Leave blank or add a Blockscout API key if needed, otherwise use empty
  },
  compilers: {
    solc: {
      version: "0.8.27",  // Ensure your Solidity version matches the one used in deployment
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
