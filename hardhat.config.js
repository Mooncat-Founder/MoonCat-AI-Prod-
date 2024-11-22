require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.27",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "paris",
          // Remove metadata hash to match deployed bytecode
          metadata: {
            bytecodeHash: "none"
          },
          // Add debug settings
          debug: {
            revertStrings: "strip"
          }
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "paris",
          metadata: {
            bytecodeHash: "none"
          },
          debug: {
            revertStrings: "strip"
          }
        },
      }
    ],
  },
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
          apiURL: "https://api-sepolia.uniscan.xyz/api",
          browserURL: "https://sepolia.uniscan.xyz",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};