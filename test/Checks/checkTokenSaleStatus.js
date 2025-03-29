// checkTokenSaleStatus.js
// This script checks the status of the TokenSaleWithPyth contract

require('dotenv').config();
const hre = require('hardhat');
const { ethers } = require('hardhat');

async function main() {
  try {
    // Get the network directly from hardhat runtime environment
    const networkName = hre.network.name;
    const chainId = hre.network.config.chainId;
    console.log(`Connected to network: ${networkName} (chainId: ${chainId})`);
    
    // Determine which contract address to use based on the network
    let tokenSaleAddress;
    
    if (networkName === 'unichain-sepolia-testnet') {
      tokenSaleAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_SALE_ADDRESS"];
      console.log(`Using UniChain Sepolia Testnet TokenSale contract at: ${tokenSaleAddress}`);
    } else if (networkName === 'unichain-mainnet') {
      tokenSaleAddress = process.env["UNICHAIN-MAINNET_SALE_ADDRESS"];
      console.log(`Using UniChain Mainnet TokenSale contract at: ${tokenSaleAddress}`);
    } else {
      throw new Error(`Unsupported network: ${networkName}`);
    }
    
    if (!tokenSaleAddress) {
      throw new Error(`Token sale address not found in environment variables for network ${networkName}`);
    }
    
    // Get contract ABI - assuming you have the ABI in your artifacts
    const TokenSaleArtifact = await ethers.getContractFactory("TokenSaleWithPyth");
    
    // Connect to the deployed contract
    const tokenSale = TokenSaleArtifact.attach(tokenSaleAddress);
    
    // Get contract status information
    const isPaused = await tokenSale.paused();
    const isEmergencyMode = await tokenSale.emergencyMode();
    const isSaleFinalized = await tokenSale.saleFinalized();
    
    // Get token addresses
    const mctTokenAddress = await tokenSale.mctToken();
    const usdtTokenAddress = await tokenSale.usdtToken();
    
    // Get treasury wallet
    const treasuryWallet = await tokenSale.treasuryWallet();
    
    // Get total raised
    const totalRaised = await tokenSale.getTotalRaised();
    const totalEthRaised = ethers.formatEther(totalRaised[0]);
    const totalUsdtRaised = ethers.formatUnits(totalRaised[1], 6); // Assuming USDT has 6 decimals
    
    // Get remaining tokens
    const remainingTokens = await tokenSale.remainingTokens();
    const remainingTokensFormatted = ethers.formatEther(remainingTokens);
    
    // Check contract balance
    const contractEthBalance = await ethers.provider.getBalance(tokenSaleAddress);
    const contractEthBalanceFormatted = ethers.formatEther(contractEthBalance);
    
    // Format and display results
    console.log("\n=== TokenSaleWithPyth Contract Status ===");
    console.log(`Contract Address: ${tokenSaleAddress}`);
    console.log(`MCT Token Address: ${mctTokenAddress}`);
    console.log(`USDT Token Address: ${usdtTokenAddress}`);
    console.log(`Treasury Wallet: ${treasuryWallet}`);
    console.log("\n=== Sale Status ===");
    console.log(`Paused: ${isPaused ? "YES" : "NO"}`);
    console.log(`Emergency Mode: ${isEmergencyMode ? "ACTIVE" : "INACTIVE"}`);
    console.log(`Sale Finalized: ${isSaleFinalized ? "YES" : "NO"}`);
    console.log("\n=== Financial Status ===");
    console.log(`Total ETH Raised: ${totalEthRaised} ETH`);
    console.log(`Total USDT Raised: ${totalUsdtRaised} USDT`);
    console.log(`Remaining Tokens: ${remainingTokensFormatted} MCT`);
    console.log(`Contract ETH Balance: ${contractEthBalanceFormatted} ETH`);
    
    console.log("\n=== Sale Parameters ===");
    console.log(`Token Price: $${ethers.formatUnits(await tokenSale.TOKEN_PRICE_USD(), 6)}`);
    console.log(`Min Purchase: $${ethers.formatUnits(await tokenSale.MIN_PURCHASE_USD(), 6)}`);
    console.log(`Max Purchase: $${ethers.formatUnits(await tokenSale.MAX_PURCHASE_USD(), 6)}`);
    
  } catch (error) {
    console.error("Error checking token sale status:", error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });