require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require('dotenv').config();

module.exports = {
  solidity: "0.8.27",  // keeping your version
  networks: {
    'unichain-sepolia-testnet': {  // changed network name
      url: 'https://sepolia.unichain.org',  // using their recommended URL
      chainId: 1301,
      accounts: [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: {
      'unichain-sepolia-testnet': 'empty'  // using their recommended naming
    },
    customChains: [
      {
        network: "unichain-sepolia-testnet",  // matched to their network name
        chainId: 1301,
        urls: {
          apiURL: "https://unichain-sepolia.blockscout.com/api",  // using their API URL
          browserURL: "https://unichain-sepolia.blockscout.com"    // using their browser URL
        }
      }
    ]
  }
};