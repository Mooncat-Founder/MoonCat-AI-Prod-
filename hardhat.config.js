require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Import task functionality from Hardhat
const { task } = require("hardhat/config");

// Define the sale management task
task("sale-manage", "Manage sale contract operations")
  .addPositionalParam("action", "Action to perform (pause/unpause)")
  .addFlag("schedule", "Schedule the operation")
  .addFlag("execute", "Execute a scheduled operation")
  .addFlag("list", "List pending operations")
  .addOptionalParam("id", "Operation ID for execution")
  .setAction(async (taskArgs, hre) => {
    console.log(`Running sale-manage with action: ${taskArgs.action}`);
    console.log(`Network: ${hre.network.name}`);
    
    try {
      // Check if the pause script exists
      const scriptPath = path.resolve(__dirname, "scripts/sale/pause.js");
      if (!fs.existsSync(scriptPath)) {
        console.error(`Error: Script not found at: ${scriptPath}`);
        return;
      }
      
      // Import the script module
      const pauseScript = require(scriptPath);
      
      // If the script exports a main function, call it with arguments
      if (typeof pauseScript.main === 'function') {
        await pauseScript.main(taskArgs, hre);
      } else {
        console.error("Error: Script does not export a main function");
      }
    } catch (error) {
      console.error("Error running sale-manage task:", error);
    }
  });

// Define a task to list pending operations
task("sale-list", "List pending sale operations")
  .setAction(async (_, hre) => {
    console.log(`Running sale-list on network: ${hre.network.name}`);
    
    try {
      // Check if the list-pending script exists
      const scriptPath = path.resolve(__dirname, "scripts/sale/list-pending.js");
      if (!fs.existsSync(scriptPath)) {
        console.error(`Error: Script not found at: ${scriptPath}`);
        return;
      }
      
      // Import the script module
      const listScript = require(scriptPath);
      
      // If the script exports a main function, call it
      if (typeof listScript.main === 'function') {
        await listScript.main(_, hre);
      } else {
        console.error("Error: Script does not export a main function");
      }
    } catch (error) {
      console.error("Error running sale-list task:", error);
    }
  });

// Define a task to execute all ready operations
task("sale-execute-all", "Execute all ready sale operations")
  .setAction(async (_, hre) => {
    console.log(`Running sale-execute-all on network: ${hre.network.name}`);
    
    try {
      // Check if the execute-pending script exists
      const scriptPath = path.resolve(__dirname, "scripts/sale/execute-pending.js");
      if (!fs.existsSync(scriptPath)) {
        console.error(`Error: Script not found at: ${scriptPath}`);
        return;
      }
      
      // Import the script module
      const executeScript = require(scriptPath);
      
      // If the script exports a main function, call it
      if (typeof executeScript.main === 'function') {
        await executeScript.main(_, hre);
      } else {
        console.error("Error: Script does not export a main function");
      }
    } catch (error) {
      console.error("Error running sale-execute-all task:", error);
    }
  });

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