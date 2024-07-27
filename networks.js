const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

const sepoliaProvider = new HDWalletProvider({
  privateKeys: [privateKey],
  providerOrUrl: `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`
});

module.exports = {
  networks: {
    sepolia: {
      provider: () => sepoliaProvider,
      network_id: 11155111, // Sepolia's network id
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      networkCheckTimeout: 10000,
      skipDryRun: true
    },
    // Comment out the mainnet configuration for now
    // mainnet: {
    //   provider: () => mainnetProvider,
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
    }
  }
};
