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
        providerOrUrl: `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`
      }),
      network_id: 11155111, // Sepolia's network id
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      networkCheckTimeout: 10000,
      skipDryRun: true
    },
    // Mainnet configuration commented out for now
    // mainnet: {
    //   provider: () => new HDWalletProvider({
    //     privateKeys: [privateKey],
    //     providerOrUrl: `https://eth-mainnet.alchemyapi.io/v2/${alchemyApiKey}`
    //   }),
    //   network_id: 1, // Mainnet's id
    //   gas: 5500000,
    //   confirmations: 2,
    //   timeoutBlocks: 200,
    //   skipDryRun: false
    // }
  },
  compilers: {
    solc: {
      version: "0.8.19", // Fetch exact version from solc-bin (default: truffle's version)
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
