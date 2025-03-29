// check-safe-balance.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Checking Safe balance on network:", network.name);
  
  const safeAddress = "0xe9b3A13636717BfEEb1871e00B914Ad77a3F6964";
  
  // Check balance using provider
  const balance = await ethers.provider.getBalance(safeAddress);
  console.log(`Safe balance via provider: ${ethers.formatEther(balance)} ETH`);
  
  // Let's also try a direct RPC call
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log(`Current block number: ${blockNumber}`);
  
  // Get the network URL from hardhat config
  const networkConfig = hre.config.networks[network.name];
  console.log(`Network URL: ${networkConfig.url}`);
  
  // Create a new provider with explicit network
  const directProvider = new ethers.JsonRpcProvider(networkConfig.url);
  const directBalance = await directProvider.getBalance(safeAddress);
  console.log(`Safe balance via direct RPC: ${ethers.formatEther(directBalance)} ETH`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });