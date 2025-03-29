// scripts/list-timelock-operations.js
const hre = require("hardhat");
require('dotenv').config();
const { getAllOperations } = require('../utils/timelock-operations-storage.js');

async function main() {
  try {
    // Get the network
    const network = hre.network.name;
    console.log(`Running on network: ${network}`);
    
    // Get all operations for the current network
    const operations = getAllOperations({ network });
    
    if (operations.length === 0) {
      console.log('\nNo saved timelock operations found for this network.');
      console.log('Run transactions with the unpause-through-timelock.js script to save operations.');
      return;
    }
    
    console.log(`\nFound ${operations.length} timelock operations for network: ${network}`);
    
    // Connect to the relevant timelock contract to check status
    const { ethers } = hre;
    
    let timelockAddress;
    if (network.includes("mainnet")) {
      timelockAddress = process.env["UNICHAIN-MAINNET_SALE_TIMELOCK_ADDRESS"];
    } else {
      timelockAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_SALE_TIMELOCK_ADDRESS"];
    }
    
    // Timelock ABI for status checking
    const TIMELOCK_ABI = [
      "function isOperation(bytes32 id) external view returns (bool)",
      "function isOperationPending(bytes32 id) external view returns (bool)",
      "function isOperationReady(bytes32 id) external view returns (bool)",
      "function isOperationDone(bytes32 id) external view returns (bool)",
      "function getTimestamp(bytes32 id) external view returns (uint256)"
    ];
    
    const provider = ethers.provider;
    const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
    
    // Display operations with status
    console.log('\n=== Timelock Operations ===');
    
    for (const op of operations) {
      console.log('\n---------------------------------------');
      console.log(`Description: ${op.description || 'Unknown operation'}`);
      console.log(`Operation ID: ${op.id}`);
      
      // Check current status
      try {
        const exists = await timelock.isOperation(op.id);
        
        if (exists) {
          const isPending = await timelock.isOperationPending(op.id);
          const isReady = await timelock.isOperationReady(op.id);
          const isDone = await timelock.isOperationDone(op.id);
          const timestamp = await timelock.getTimestamp(op.id);
          
          const status = isDone ? "Executed" : isReady ? "Ready for execution" : isPending ? "Pending" : "Unknown";
          const executionTime = new Date(Number(timestamp) * 1000);
          
          console.log(`Status: ${status}`);
          console.log(`Scheduled Execution Time: ${executionTime.toLocaleString()}`);
          
          if (isReady && !isDone) {
            console.log('\nThis operation is READY TO EXECUTE');
            console.log(`Run: npx hardhat run scripts/execute-timelock-operation.js --network ${network} --id ${op.id}`);
          } else if (isPending) {
            const now = new Date();
            const timeUntilReady = (executionTime - now) / 1000;
            console.log(`Time until ready: ${Math.round(timeUntilReady)} seconds (${(timeUntilReady / 3600).toFixed(2)} hours)`);
          }
        } else {
          console.log('Status: Not found on chain (may have been deleted or not yet scheduled)');
        }
      } catch (error) {
        console.log(`Error checking status: ${error.message}`);
      }
      
      // Display operation details
      console.log('\nOperation details:');
      console.log(`Target: ${op.target}`);
      console.log(`Function Data: ${op.data}`);
      console.log(`Value: ${op.value}`);
      console.log(`Salt: ${op.salt}`);
      console.log(`Created: ${new Date(op.createdAt).toLocaleString()}`);
    }
    
    console.log('\n---------------------------------------');
    console.log('\nTo execute an operation:');
    console.log(`npx hardhat run scripts/execute-timelock-operation.js --network ${network}`);
    console.log('Then select the operation from the list.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });