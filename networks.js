const HDWalletProvider = require('@truffle/hdwallet-provider');
const dotenv = require('dotenv');

dotenv.config();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const infuraProjectId = process.env.INFURA_PROJECT_ID;
const infuraProjectSecret = process.env.INFURA_PROJECT_SECRET;

// Debugging - Print out the environment variables
console.log("Sepolia Private Key Length:", process.env.DEPLOYER_PRIVATE_KEY.length);
// Comment out the mainnet private key length check
// console.log("Mainnet Private Key Length:", process.env.MAINNET_PRIVATE_KEY.length);

const sepoliaProvider = new HDWalletProvider({
  privateKeys: [process.env.DEPLOYER_PRIVATE_KEY],
  providerOrUrl: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
  headers: {
    'Infura-Secret': process.env.INFURA_PROJECT_SECRET
  }
});

// Comment out the mainnet provider configuration for now
// const mainnetProvider = new HDWalletProvider({
//   privateKeys: [process.env.MAINNET_PRIVATE_KEY],
//   providerOrUrl: `https://mainnet.infura.io/v3/${process.env.MAINNET_INFURA_PROJECT_ID}`,
//   headers: {
//     'Infura-Secret': process.env.INFURA_PROJECT_SECRET
//   }
// });

module.exports = {
  sepolia: {
    provider: () => sepoliaProvider,
    network_id: 11155111,
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
