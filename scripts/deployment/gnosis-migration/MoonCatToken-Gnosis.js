// scripts/Token-Gnosis.js
require('dotenv').config();
const { ethers } = require('hardhat');

async function migrateMoonCatToken() {
  console.log("Starting MoonCatToken ownership migration...");
  
  // Get network name for the environment variable format in the .env file
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name.toUpperCase();
  
  // Get Safe address from .env file
  const safeAddress = process.env[`${networkName}_MOONCAT_TOKEN_SAFE`];
  if (!safeAddress) {
    throw new Error(`${networkName}_MOONCAT_TOKEN_SAFE not found in environment variables`);
  }
  console.log("Using Safe address:", safeAddress);
  
  // Using the network name to construct the environment variable name
  const tokenAddress = process.env[`${networkName}_MCT_ADDRESS`];
  console.log("Looking for MoonCat Token at address:", tokenAddress);
  
  if (!tokenAddress) {
    throw new Error(`${networkName}_MCT_ADDRESS not found in environment variables`);
  }

  const MoonCatToken = await ethers.getContractFactory("MoonCatToken");
  const token = MoonCatToken.attach(tokenAddress);
  
  // Verify current owner
  const currentOwner = await token.owner();
  console.log("Current token owner:", currentOwner);
  
  const deployerAddress = await deployer.getAddress();
  if (currentOwner.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error(`Deployer (${deployerAddress}) is not the current owner of the token. Current owner is ${currentOwner}`);
  }
  
  console.log("Transferring ownership to Safe...");
  const tx = await token.transferOwnership(safeAddress);
  console.log("Waiting for transaction:", tx.hash);
  await tx.wait();
  
  // Verify new owner
  const newOwner = await token.owner();
  console.log("New token owner:", newOwner);
  
  if (newOwner.toLowerCase() !== safeAddress.toLowerCase()) {
    throw new Error("Ownership transfer failed - please verify!");
  }
  
  console.log("MoonCatToken ownership successfully transferred to Safe:", safeAddress);
  return { safeAddress, tokenAddress };
}

async function main() {
  try {
    console.log("Starting migration process...");
    
    const { safeAddress, tokenAddress } = await migrateMoonCatToken();
    
    console.log("\nMoonCatToken Migration Summary:");
    console.log("--------------------------------");
    console.log("Safe Address:", safeAddress);
    console.log("Token Address:", tokenAddress);
    console.log("Migration Status: Complete");
    
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });