// scripts/emergency-withdraw.js
const hre = require("hardhat");
const path = require('path');
require('dotenv').config();
const readline = require('readline');

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user for input
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));

// Staking contract ABI for emergency withdrawal
const STAKING_ABI = [
  "function emergencyWithdraw() external",
  "function emergencyMode() external view returns (bool)",
  "function stakes7Days(address) external view returns (uint256, uint256, uint256, bool, uint256, uint256)",
  "function stakes1Year(address) external view returns (uint256, uint256, uint256, bool, uint256, uint256)"
];

// ERC20 ABI for token operations
const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

async function main() {
  try {
    // Get ethers from hardhat
    const { ethers } = hre;
    
    // Determine network
    const network = hre.network.name;
    console.log(`Running on network: ${network}`);
    console.log("Starting emergency withdrawal process...");
    
    // Get addresses from environment based on network
    let stakingContractAddress, tokenAddress;
    
    if (network.includes("mainnet")) {
      stakingContractAddress = process.env["UNICHAIN-MAINNET_STAKING_ADDRESS"];
      tokenAddress = process.env["UNICHAIN-MAINNET_MCT_ADDRESS"];
    } else {
      stakingContractAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_STAKING_ADDRESS"];
      tokenAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_MCT_ADDRESS"];
    }
    
    // Check if we have all the required addresses
    if (!stakingContractAddress || !tokenAddress) {
      throw new Error(`Missing environment variables for ${network}:\n` + 
        `${!stakingContractAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_STAKING_ADDRESS" : "UNICHAIN-SEPOLIA-TESTNET_STAKING_ADDRESS") + "\n" : ""}` +
        `${!tokenAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_MCT_ADDRESS" : "UNICHAIN-SEPOLIA-TESTNET_MCT_ADDRESS") : ""}`
      );
    }
    
    console.log('Staking Contract Address:', stakingContractAddress);
    console.log('Token Address:', tokenAddress);
    
    // Load private key or signer
    const privateKey = process.env.PERSONAL_KEY;
    if (!privateKey) {
      console.error("Missing personal private key. Set the PERSONAL_KEY environment variable.");
      process.exit(1);
    }
    
    const provider = ethers.provider;
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Using wallet: ${wallet.address}`);
    
    // Connect to contracts
    const stakingContract = new ethers.Contract(stakingContractAddress, STAKING_ABI, wallet);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    // Check if emergency mode is active
    const emergencyModeActive = await stakingContract.emergencyMode();
    
    if (!emergencyModeActive) {
      console.error("Emergency mode is not active. Cannot perform emergency withdrawal.");
      console.log("Emergency withdrawals are only possible when the contract is in emergency mode.");
      rl.close();
      process.exit(1);
    }
    
    console.log('\nEmergency mode is active. You can perform an emergency withdrawal.');
    
    // Get token info
    const tokenSymbol = await tokenContract.symbol();
    const tokenDecimals = await tokenContract.decimals();
    
    // Check user's staked balances
    const stake7Days = await stakingContract.stakes7Days(wallet.address);
    const stake1Year = await stakingContract.stakes1Year(wallet.address);
    
    const amount7Days = stake7Days[0]; // The first value is the staked amount
    const amount1Year = stake1Year[0]; // The first value is the staked amount
    
    const totalStaked = amount7Days + amount1Year;
    
    if (totalStaked === 0n) {
      console.log(`\nYou don't have any tokens staked in the contract. Nothing to withdraw.`);
      rl.close();
      process.exit(0);
    }
    
    console.log(`\nYour staked balances:`);
    console.log(`7-Day staking: ${ethers.formatUnits(amount7Days, tokenDecimals)} ${tokenSymbol}`);
    console.log(`1-Year staking: ${ethers.formatUnits(amount1Year, tokenDecimals)} ${tokenSymbol}`);
    console.log(`Total: ${ethers.formatUnits(totalStaked, tokenDecimals)} ${tokenSymbol}`);
    
    // Check user's token balance before withdrawal
    const userBalanceBefore = await tokenContract.balanceOf(wallet.address);
    console.log(`\nYour current ${tokenSymbol} balance: ${ethers.formatUnits(userBalanceBefore, tokenDecimals)}`);
    
    // Confirm emergency withdrawal
    console.log(`\nWARNING: Emergency withdrawal will withdraw all your staked tokens without rewards.`);
    console.log(`This action is irreversible and should only be used in emergency situations.`);
    const confirmWithdrawal = await prompt('\nAre you sure you want to proceed with emergency withdrawal? (yes/no): ');
    
    if (confirmWithdrawal.toLowerCase() !== 'yes') {
      console.log('Emergency withdrawal cancelled.');
      rl.close();
      process.exit(0);
    }
    
    // Perform emergency withdrawal
    console.log('\nExecuting emergency withdrawal...');
    
    const tx = await stakingContract.emergencyWithdraw({ 
      gasLimit: 500000,
      maxFeePerGas: ethers.parseUnits("20", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
    });
    
    console.log('Waiting for transaction confirmation...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log('\nEmergency withdrawal successful!');
      console.log('Transaction hash:', receipt.hash);
      
      // Check stakes after withdrawal
      const stake7DaysAfter = await stakingContract.stakes7Days(wallet.address);
      const stake1YearAfter = await stakingContract.stakes1Year(wallet.address);
      
      const amount7DaysAfter = stake7DaysAfter[0];
      const amount1YearAfter = stake1YearAfter[0];
      
      // Check user's token balance after withdrawal
      const userBalanceAfter = await tokenContract.balanceOf(wallet.address);
      
      console.log(`\nStaked balances after withdrawal:`);
      console.log(`7-Day staking: ${ethers.formatUnits(amount7DaysAfter, tokenDecimals)} ${tokenSymbol}`);
      console.log(`1-Year staking: ${ethers.formatUnits(amount1YearAfter, tokenDecimals)} ${tokenSymbol}`);
      
      console.log(`\nYour new ${tokenSymbol} balance: ${ethers.formatUnits(userBalanceAfter, tokenDecimals)}`);
      console.log(`Balance change: +${ethers.formatUnits(userBalanceAfter - userBalanceBefore, tokenDecimals)} ${tokenSymbol}`);
    } else {
      throw new Error('Transaction failed');
    }
    
  } catch (error) {
    console.error("Error during emergency withdrawal:", error.message);
    if (error.error?.message) {
      console.error("Error details:", error.error.message);
    }
  } finally {
    rl.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });