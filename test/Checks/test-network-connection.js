// scripts/test-network-connection.js
const hre = require("hardhat");
const { ethers } = require("hardhat");
require('dotenv').config();

/**
 * Test network connection to the current network configured in Hardhat
 */
async function main() {
  try {
    console.log("=== Testing Network Connection ===");
    
    // Get the current network from Hardhat
    const networkName = hre.network.name;
    console.log(`Testing connection to ${networkName}...`);
    
    // Get the expected chain ID based on the network
    let expectedChainId;
    if (networkName === 'unichain-sepolia-testnet') {
      expectedChainId = 1301;
    } else if (networkName === 'unichain-mainnet') {
      expectedChainId = 130;
    } else {
      expectedChainId = hre.network.config.chainId;
    }
    
    // Get the provider from Hardhat
    const provider = ethers.provider;
    
    // Try to get the latest block
    console.log("Fetching latest block...");
    const blockNumber = await provider.getBlockNumber();
    console.log(`Latest block number: ${blockNumber}`);
    
    // Get network information using the provider's getNetwork method instead of getChainId
    console.log("Getting network information...");
    const network = await provider.getNetwork();
    const chainId = network.chainId;
    console.log(`Chain ID: ${chainId}`);
    
    // Verify chain ID
    if (Number(chainId) !== expectedChainId) {
      console.warn(`⚠️ Chain ID mismatch! Expected ${expectedChainId}, got ${chainId}`);
    } else {
      console.log(`✅ Chain ID verified: ${chainId}`);
    }
    
    // Get gas price
    console.log("Getting fee data...");
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || ethers.parseUnits("5", "gwei");
    console.log(`Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
    
    // Get signer and balance
    try {
      console.log("Getting signer information...");
      const [signer] = await ethers.getSigners();
      const address = await signer.getAddress();
      console.log(`Deployer address: ${address}`);
      
      const balance = await provider.getBalance(address);
      console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);
      
      if (balance == 0n) {
        console.warn(`⚠️ Warning: Deployer has 0 ETH balance`);
      }
    } catch (error) {
      console.error(`Error getting deployer info: ${error.message}`);
    }
    
    console.log(`✅ Connection test successful for ${networkName}`);
    
  } catch (error) {
    console.error(`❌ Failed to connect to network`);
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}