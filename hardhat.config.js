require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require('dotenv').config();

module.exports = {
  solidity: "0.8.27",
  networks: {
    'unichain-sepolia-testnet': {
      url: 'https://sepolia.unichain.org',
      chainId: 1301,
      accounts: [`0x${process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY}`],
    },
    'unichain-mainnet': {
      url: 'https://mainnet.unichain.org/',
      chainId: 130, // Unichain mainnet chain ID
      accounts: [`0x${process.env.MAINNET_DEPLOYER_PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: {
      'unichain-sepolia-testnet': 'empty',
      'unichain-mainnet': 'empty'
    },
    customChains: [
      {
        network: "unichain-sepolia-testnet",
        chainId: 1301,
        urls: {
          apiURL: "https://unichain-sepolia.blockscout.com/api",
          browserURL: "https://unichain-sepolia.blockscout.com"
        }
      },
      {
        network: "unichain-mainnet",
        chainId: 130,
        urls: {
          apiURL: "https://unichain.blockscout.com/api",
          browserURL: "https://unichain.blockscout.com"
        }
      }
    ]
  }
};