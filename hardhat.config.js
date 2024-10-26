require("@nomicfoundation/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require('dotenv').config();

module.exports = {
  solidity: "0.8.27",
  networks: {
    unichain: {
      url: `https://unichain-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 1301,
      accounts: [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: {
      unichain: process.env.ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "unichain",
        chainId: 1301,
        urls: {
          apiURL: "https://api-sepolia.uniscan.xyz/api", // Ensure this is the correct API URL
          browserURL: "https://sepolia.uniscan.xyz/",
        },
      },
    ],
  },
};
