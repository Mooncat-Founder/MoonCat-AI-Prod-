const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const infuraProjectId = process.env.INFURA_PROJECT_ID;
const infuraProjectSecret = process.env.INFURA_PROJECT_SECRET;

const sepoliaProvider = new HDWalletProvider({
  privateKeys: [privateKey],
  providerOrUrl: `https://sepolia.infura.io/v3/${infuraProjectId}`,
  headers: {
    'Infura-Secret': infuraProjectSecret
  }
});

module.exports = {
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
};
