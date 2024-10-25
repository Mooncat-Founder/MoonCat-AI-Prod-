const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;
const verifyApiKey = process.env.ETHERSCAN_API_KEY || ''; // Used for Unichain verification

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
      skipDryRun: true
    }
  },
  
  plugins: ['truffle-plugin-verify'],
  
  api_keys: {
    etherscan: verifyApiKey // Will be used for Unichain verification
  },

  // Important: Add this verification config
  verify: {
    proxy: {
      host: 'https://www.exceptionrecovery.org/api', // Unichain verifier API
      apiKey: verifyApiKey
    }
  },
  
  compilers: {
    solc: {
      version: "0.8.27",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "paris"
      }
    }
  }
};