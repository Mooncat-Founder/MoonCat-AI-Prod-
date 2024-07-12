const HDWalletProvider = require('@truffle/hdwallet-provider');

const sepoliaProvider = new HDWalletProvider(
  process.env.SEPOLIA_PRIVATE_KEY,
  `https://sepolia.infura.io/v3/${process.env.SEPOLIA_INFURA_PROJECT_ID}`
);

const mainnetProvider = new HDWalletProvider(
  process.env.MAINNET_PRIVATE_KEY,
  `https://mainnet.infura.io/v3/${process.env.MAINNET_INFURA_PROJECT_ID}`
);

module.exports = {
  networks: {
    sepolia: {
      provider: () => sepoliaProvider,
      network_id: 11155111,
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },
    mainnet: {
      provider: () => mainnetProvider,
      network_id: 1, // Mainnet's id
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: false
    }
  }
};
