// scripts/TokenSaleWithPyth-Gnosis.js
require('dotenv').config();
const { ethers } = require('hardhat');

async function migrateTokenSale() {
  console.log("Starting TokenSale ownership migration...");
  
  // Get network name for the environment variable format in the .env file
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name.toUpperCase();
  
  // Get Safe address from .env file
  const safeAddress = process.env[`${networkName}_TOKEN_SALE_SAFE`];
  if (!safeAddress) {
    throw new Error(`${networkName}_TOKEN_SALE_SAFE not found in environment variables`);
  }
  console.log("Using Safe address:", safeAddress);
  
  // Using the network name to construct the environment variable name
  const saleAddress = process.env[`${networkName}_SALE_ADDRESS`];
  console.log("Looking for TokenSale at address:", saleAddress);
  
  if (!saleAddress) {
    throw new Error(`${networkName}_SALE_ADDRESS not found in environment variables`);
  }
  
  const deployerAddress = await deployer.getAddress();
  console.log("Using address for transactions:", deployerAddress);
  
  // Create contract instance
  const TokenSale = await ethers.getContractFactory("TokenSaleWithPyth");
  const sale = await TokenSale.attach(saleAddress);
  
  // Verify current owner
  const currentOwner = await sale.owner();
  console.log("Current sale contract owner:", currentOwner);
  
  // Check if the current signer is the owner
  if (currentOwner.toLowerCase() !== deployerAddress.toLowerCase()) {
    console.log(`IMPORTANT: The address you're using (${deployerAddress}) is not the current owner.`);
    console.log(`Current owner is ${currentOwner}`);
    console.log(`Make sure you're using the private key for address ${currentOwner} in your .env file.`);
    console.log(`Otherwise, this transaction will fail.`);
    console.log(`\nPress Ctrl+C to abort, or wait 10 seconds to continue anyway...`);
    
    // Wait 10 seconds to give user time to abort
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log("\nAttempting to transfer ownership to Safe...");
  try {
    const tx = await sale.transferOwnership(safeAddress);
    console.log("Waiting for transaction:", tx.hash);
    await tx.wait();
    
    // Verify new owner
    const newOwner = await sale.owner();
    console.log("New sale contract owner:", newOwner);
    
    if (newOwner.toLowerCase() !== safeAddress.toLowerCase()) {
      throw new Error("Ownership transfer failed - owner did not change!");
    }
    
    console.log("TokenSale ownership successfully transferred to Safe:", safeAddress);
    return { safeAddress, saleAddress, transferComplete: true };
  } catch (error) {
    // Check if the contract might be using Ownable2Step
    console.log("Standard transfer failed. Checking if this is an Ownable2Step contract...");
    
    try {
      // Try to access pendingOwner to see if this is Ownable2Step
      const saleWithExtendedABI = new ethers.Contract(
        saleAddress,
        [
          "function owner() view returns (address)",
          "function pendingOwner() view returns (address)",
          "function transferOwnership(address newOwner)",
          "function acceptOwnership()"
        ],
        deployer
      );
      
      // Check if there's a pending owner
      const pendingOwner = await saleWithExtendedABI.pendingOwner();
      console.log("Contract is using Ownable2Step. Current pending owner:", pendingOwner);
      
      // Try to transfer ownership with Ownable2Step
      console.log("Initiating two-step ownership transfer to Safe...");
      const tx = await saleWithExtendedABI.transferOwnership(safeAddress);
      console.log("Waiting for transaction:", tx.hash);
      await tx.wait();
      
      // Verify pending owner
      const newPendingOwner = await saleWithExtendedABI.pendingOwner();
      console.log("New pending owner:", newPendingOwner);
      
      if (newPendingOwner.toLowerCase() !== safeAddress.toLowerCase()) {
        throw new Error("Ownership transfer initiation failed - pendingOwner is not set correctly");
      }
      
      console.log("Two-step ownership transfer initiated successfully!");
      console.log("The Safe must now call acceptOwnership() to complete the transfer.");
      
      return { safeAddress, saleAddress, transferComplete: false, twoStep: true };
    } catch (innerError) {
      console.error("All transfer attempts failed:", innerError);
      throw new Error(`Ownership transfer failed: ${error.message}`);
    }
  }
}

async function main() {
  try {
    console.log("Starting migration process...");
    
    // Migrate token sale ownership
    const result = await migrateTokenSale();
    
    console.log("\nTokenSale Migration Summary:");
    console.log("--------------------------------");
    console.log("Safe Address:", result.safeAddress);
    console.log("Sale Contract Address:", result.saleAddress);
    
    if (result.transferComplete) {
      console.log("Migration Status: Complete");
    } else if (result.twoStep) {
      console.log("Migration Status: Pending Safe Acceptance");
      console.log("ACTION REQUIRED: The Safe must accept ownership by calling acceptOwnership()");
      console.log("Instructions:");
      console.log("1. Go to app.safe.global and connect to your Safe");
      console.log("2. Use the 'New Transaction' > 'Contract Interaction' option");
      console.log("3. Enter the sale contract address:", result.saleAddress);
      console.log("4. Select the 'acceptOwnership()' function");
      console.log("5. Submit and approve the transaction with required signatures");
    } else {
      console.log("Migration Status: Failed");
    }
    
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Execute migration
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });