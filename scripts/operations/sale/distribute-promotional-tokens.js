// scripts/distribute-promotional-tokens.js
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

// Create readline interface for user prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user for input
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));

// ERC20 ABI for token transfer
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function name() external view returns (string)"
];

// Determine which keys file to use based on the network
const network = hre.network.name || "unichain-sepolia-testnet";
const keysFile = network.includes("mainnet") ? "keys.prod.json" : "keys.test.json";
let safeConfig;

try {
    safeConfig = require(path.join(process.cwd(), keysFile));
    console.log(`Loaded keys from ${keysFile}`);
} catch (error) {
    console.error(`Error loading keys from ${keysFile}: ${error.message}`);
    console.log(`Make sure ${keysFile} exists in the project root directory.`);
    rl.close();
    process.exit(1);
}

async function loadPurchaseData() {
    const dataDir = path.join(__dirname, '..', 'data');
    
    if (!fs.existsSync(dataDir)) {
        throw new Error(`Data directory not found at ${dataDir}. Please run extract-purchase-data.js first.`);
    }
    
    // Get all JSON files in the data directory
    const files = fs.readdirSync(dataDir)
        .filter(file => file.startsWith('purchase-data-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first
    
    if (files.length === 0) {
        throw new Error('No purchase data files found. Please run extract-purchase-data.js first.');
    }
    
    // List available files
    console.log('\nAvailable purchase data files:');
    files.forEach((file, index) => {
        const stats = fs.statSync(path.join(dataDir, file));
        const date = new Date(stats.mtime).toLocaleString();
        console.log(`${index + 1}: ${file} (created: ${date})`);
    });
    
    // Ask which file to use
    const fileIndex = parseInt(await prompt('\nEnter the number of the file to use: ')) - 1;
    
    if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
        throw new Error('Invalid file selection');
    }
    
    const selectedFile = files[fileIndex];
    console.log(`\nUsing file: ${selectedFile}`);
    
    // Load the JSON data
    const jsonPath = path.join(dataDir, selectedFile);
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    return jsonData;
}

async function calculateRewards(purchases, metadata) {
    console.log('\n=== Reward Calculation ===');
    
    // Define reward strategies
    console.log('\nAvailable reward strategies:');
    console.log('1: First X% of buyers - Reward early adopters');
    console.log('2: Top X% by purchase amount - Reward largest contributors');
    console.log('3: All buyers - Distribute evenly to everyone');
    console.log('4: Custom tiers - Define multiple tiers');
    
    const strategyChoice = await prompt('\nSelect a reward strategy (1-4): ');
    
    let rewards = [];
    const decimals = metadata.mctToken.decimals;
    
    if (strategyChoice === '1') {
        // Strategy 1: First X% of buyers
        const percentage = parseFloat(await prompt('Enter the percentage of early buyers to reward (e.g., 10 for first 10%): '));
        const tokenAmount = await prompt(`Enter the token amount to distribute to each qualifying buyer (in ${metadata.mctToken.symbol}): `);
        
        // Convert to token amount with decimals
        const tokenAmountWithDecimals = ethers.parseUnits(tokenAmount, decimals);
        
        // Calculate cutoff
        const cutoffPercentile = percentage;
        
        // Filter qualifying purchases
        const qualifyingPurchases = purchases.filter(p => parseFloat(p.percentile) <= cutoffPercentile);
        
        console.log(`\nQualifying buyers: ${qualifyingPurchases.length} (first ${percentage}% of all buyers)`);
        
        // Calculate total tokens needed
        const totalTokensNeeded = tokenAmountWithDecimals * BigInt(qualifyingPurchases.length);
        const formattedTotalNeeded = ethers.formatUnits(totalTokensNeeded, decimals);
        
        console.log(`Total tokens needed: ${formattedTotalNeeded} ${metadata.mctToken.symbol}`);
        
        // Create rewards list
        rewards = qualifyingPurchases.map(purchase => ({
            buyer: purchase.buyer,
            tokenAmount: tokenAmountWithDecimals,
            reason: `Early buyer (percentile: ${purchase.percentile}%)`
        }));
    } 
    else if (strategyChoice === '2') {
        // Strategy 2: Top X% by purchase amount
        const percentage = parseFloat(await prompt('Enter the percentage of top buyers to reward (e.g., 20 for top 20%): '));
        const tokenAmount = await prompt(`Enter the token amount to distribute to each qualifying buyer (in ${metadata.mctToken.symbol}): `);
        
        // Convert to token amount with decimals
        const tokenAmountWithDecimals = ethers.parseUnits(tokenAmount, decimals);
        
        // Sort purchases by amount (highest first)
        const sortedPurchases = [...purchases].sort((a, b) => 
            parseFloat(b.amountUSD) - parseFloat(a.amountUSD)
        );
        
        // Calculate cutoff
        const cutoffIndex = Math.floor(sortedPurchases.length * (percentage / 100));
        
        // Filter qualifying purchases
        const qualifyingPurchases = sortedPurchases.slice(0, cutoffIndex);
        
        console.log(`\nQualifying buyers: ${qualifyingPurchases.length} (top ${percentage}% by purchase amount)`);
        console.log(`Minimum qualifying purchase: $${qualifyingPurchases[qualifyingPurchases.length-1]?.amountUSD || 0}`);
        
        // Calculate total tokens needed
        const totalTokensNeeded = tokenAmountWithDecimals * BigInt(qualifyingPurchases.length);
        const formattedTotalNeeded = ethers.formatUnits(totalTokensNeeded, decimals);
        
        console.log(`Total tokens needed: ${formattedTotalNeeded} ${metadata.mctToken.symbol}`);
        
        // Create rewards list
        rewards = qualifyingPurchases.map(purchase => ({
            buyer: purchase.buyer,
            tokenAmount: tokenAmountWithDecimals,
            reason: `Top buyer (amount: $${purchase.amountUSD})`
        }));
    } 
    else if (strategyChoice === '3') {
        // Strategy 3: All buyers evenly
        const tokenAmount = await prompt(`Enter the token amount to distribute to each buyer (in ${metadata.mctToken.symbol}): `);
        
        // Convert to token amount with decimals
        const tokenAmountWithDecimals = ethers.parseUnits(tokenAmount, decimals);
        
        // Get unique buyers (in case some buyers made multiple purchases)
        const uniqueBuyers = [...new Set(purchases.map(p => p.buyer))];
        
        console.log(`\nQualifying buyers: ${uniqueBuyers.length} (all unique buyers)`);
        
        // Calculate total tokens needed
        const totalTokensNeeded = tokenAmountWithDecimals * BigInt(uniqueBuyers.length);
        const formattedTotalNeeded = ethers.formatUnits(totalTokensNeeded, decimals);
        
        console.log(`Total tokens needed: ${formattedTotalNeeded} ${metadata.mctToken.symbol}`);
        
        // Create rewards list
        rewards = uniqueBuyers.map(buyer => ({
            buyer,
            tokenAmount: tokenAmountWithDecimals,
            reason: `Participation reward`
        }));
    } 
    else if (strategyChoice === '4') {
        // Strategy 4: Custom tiers
        console.log('\n=== Custom Tier Setup ===');
        console.log('You can define multiple tiers based on percentile ranges.');
        
        const numTiers = parseInt(await prompt('How many tiers do you want to create? '));
        
        if (isNaN(numTiers) || numTiers <= 0) {
            throw new Error('Invalid number of tiers');
        }
        
        const tiers = [];
        
        for (let i = 0; i < numTiers; i++) {
            console.log(`\n--- Tier ${i + 1} ---`);
            const maxPercentile = parseFloat(await prompt(`Maximum percentile for tier ${i + 1} (e.g., 10 for first 10% of buyers): `));
            const minPercentile = i > 0 ? tiers[i-1].maxPercentile : 0;
            const tokenAmount = await prompt(`Token amount for tier ${i + 1} (in ${metadata.mctToken.symbol}): `);
            
            // Convert to token amount with decimals
            const tokenAmountWithDecimals = ethers.parseUnits(tokenAmount, decimals);
            
            tiers.push({
                minPercentile,
                maxPercentile,
                tokenAmount: tokenAmountWithDecimals
            });
        }
        
        // Validate tiers cover the full range
        if (tiers[tiers.length - 1].maxPercentile < 100) {
            console.log(`\nWARNING: Your tiers only cover up to ${tiers[tiers.length - 1].maxPercentile}% of buyers.`);
            const proceed = await prompt('Do you want to proceed anyway? (y/n): ');
            if (proceed.toLowerCase() !== 'y') {
                throw new Error('Operation cancelled');
            }
        }
        
        // Assign each purchase to a tier
        rewards = [];
        
        for (const purchase of purchases) {
            const percentile = parseFloat(purchase.percentile);
            
            // Find the matching tier
            const tier = tiers.find(t => 
                percentile > t.minPercentile && 
                percentile <= t.maxPercentile
            );
            
            if (tier) {
                rewards.push({
                    buyer: purchase.buyer,
                    tokenAmount: tier.tokenAmount,
                    reason: `Tier reward (percentile: ${purchase.percentile}%)`
                });
            }
        }
        
        // Consolidate rewards by buyer (sum up all rewards for each buyer)
        const rewardsByBuyer = {};
        
        for (const reward of rewards) {
            if (!rewardsByBuyer[reward.buyer]) {
                rewardsByBuyer[reward.buyer] = {
                    buyer: reward.buyer,
                    tokenAmount: 0n,
                    reason: 'Multiple tier rewards'
                };
            }
            
            rewardsByBuyer[reward.buyer].tokenAmount += reward.tokenAmount;
        }
        
        rewards = Object.values(rewardsByBuyer);
        
        console.log(`\nQualifying buyers: ${rewards.length}`);
        
        // Calculate total tokens needed
        const totalTokensNeeded = rewards.reduce((sum, r) => sum + r.tokenAmount, 0n);
        const formattedTotalNeeded = ethers.formatUnits(totalTokensNeeded, decimals);
        
        console.log(`Total tokens needed: ${formattedTotalNeeded} ${metadata.mctToken.symbol}`);
    } 
    else {
        throw new Error('Invalid strategy choice');
    }
    
    return rewards;
}

async function main() {
    try {
        console.log('=== Promotional Token Distribution ===');
        
        // Load purchase data
        const purchaseData = await loadPurchaseData();
        const { purchases, metadata } = purchaseData;
        
        console.log(`\nLoaded ${purchases.length} purchases from ${metadata.uniqueBuyers} unique buyers`);
        console.log(`Sale Status: ${metadata.saleStatus.estimatedTotalUsdRaised} USD raised, ${metadata.saleStatus.remainingTokens} ${metadata.mctToken.symbol} remaining`);
        
        // Calculate rewards based on our strategy
        const rewards = await calculateRewards(purchases, metadata);
        
        console.log(`\nCalculated rewards for ${rewards.length} buyers`);
        
        // Connect to the token contract
        const { ethers } = hre;
        const provider = ethers.provider;
        
        // Get the token address
        let tokenAddress = metadata.mctToken.address;
        
        // Prompt for token address, defaulting to the one from metadata
        const customTokenAddress = await prompt(`Enter the token address to distribute (default: ${tokenAddress}): `);
        
        if (customTokenAddress.trim() !== '') {
            if (!ethers.isAddress(customTokenAddress)) {
                throw new Error(`Invalid token address: ${customTokenAddress}`);
            }
            tokenAddress = customTokenAddress;
        }
        
        // Connect to the token contract
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        
        // Get token info
        const tokenSymbol = await tokenContract.symbol();
        const tokenName = await tokenContract.name();
        const tokenDecimals = await tokenContract.decimals();
        
        console.log(`\nToken Information:`);
        console.log(`Name: ${tokenName} (${tokenSymbol})`);
        console.log(`Decimals: ${tokenDecimals}`);
        
        // Check if we're using the same token
        if (tokenAddress.toLowerCase() !== metadata.mctToken.address.toLowerCase()) {
            console.log(`\nWARNING: You're using a different token than the one in the purchase data.`);
            console.log(`Purchase data token: ${metadata.mctToken.address} (${metadata.mctToken.symbol})`);
            console.log(`Selected token: ${tokenAddress} (${tokenSymbol})`);
            
            // Adjust reward amounts if decimals differ
            if (tokenDecimals !== metadata.mctToken.decimals) {
                console.log(`\nWARNING: Token decimals don't match. Adjusting reward amounts...`);
                console.log(`Purchase data token decimals: ${metadata.mctToken.decimals}`);
                console.log(`Selected token decimals: ${tokenDecimals}`);
                
                for (const reward of rewards) {
                    // Convert from original decimals to new decimals
                    const valueWithoutDecimals = ethers.formatUnits(reward.tokenAmount, metadata.mctToken.decimals);
                    reward.tokenAmount = ethers.parseUnits(valueWithoutDecimals, tokenDecimals);
                }
            }
        }
        
        // Create wallet instances from private keys
        const signers = safeConfig.signers.map(key => 
            new ethers.Wallet(key, provider)
        );

        console.log(`\nLoaded ${signers.length} signers`);
        console.log(`Signer address: ${signers[0].address}`);
        
        // Check token balance
        const tokenBalance = await tokenContract.balanceOf(signers[0].address);
        const formattedBalance = ethers.formatUnits(tokenBalance, tokenDecimals);
        
        console.log(`\nToken balance of distributor: ${formattedBalance} ${tokenSymbol}`);
        
        // Calculate total tokens needed
        const totalTokensNeeded = rewards.reduce((sum, r) => sum + r.tokenAmount, 0n);
        const formattedTotalNeeded = ethers.formatUnits(totalTokensNeeded, tokenDecimals);
        
        console.log(`Total tokens needed for distribution: ${formattedTotalNeeded} ${tokenSymbol}`);
        
        if (tokenBalance < totalTokensNeeded) {
            console.log(`\nWARNING: Insufficient token balance for complete distribution.`);
            console.log(`Missing: ${ethers.formatUnits(totalTokensNeeded - tokenBalance, tokenDecimals)} ${tokenSymbol}`);
            
            const proceed = await prompt('Do you want to proceed with partial distribution? (y/n): ');
            if (proceed.toLowerCase() !== 'y') {
                throw new Error('Distribution cancelled due to insufficient balance');
            }
        }
        
        // Export distribution plan
        const timestamp = Math.floor(Date.now() / 1000);
        const distributionPlan = {
                            metadata: {
                token: {
                    address: tokenAddress,
                    name: tokenName,
                    symbol: tokenSymbol,
                    decimals: tokenDecimals
                },
                totalTokens: formattedTotalNeeded,
                distributorBalance: formattedBalance,
                rewardCount: rewards.length,
                timestamp: timestamp,
                network
            },
            rewards: rewards.map(r => ({
                buyer: r.buyer,
                tokenAmount: ethers.formatUnits(r.tokenAmount, tokenDecimals),
                reason: r.reason
            }))
        };
        
        // Save distribution plan
        const distributionDir = path.join(__dirname, '..', '..', 'data', 'distributions');
        
        // Create the directory if it doesn't exist
        if (!fs.existsSync(distributionDir)) {
            fs.mkdirSync(distributionDir, { recursive: true });
        }
        
        const planFilePath = path.join(distributionDir, `distribution-plan-${timestamp}.json`);
        fs.writeFileSync(planFilePath, JSON.stringify(distributionPlan, null, 2));
        
        console.log(`\nDistribution plan saved to: ${planFilePath}`);
        
        // Ask for confirmation to proceed with distribution
        const confirmDistribution = await prompt('\nDo you want to proceed with token distribution? (y/n): ');
        
        if (confirmDistribution.toLowerCase() !== 'y') {
            console.log('Distribution cancelled. You can review the plan and run this script again later.');
            rl.close();
            return;
        }
        
        // Distribute tokens
        console.log('\n=== Starting Token Distribution ===');
        
        // Connect to the token contract for sending
        const tokenWithSigner = tokenContract.connect(signers[0]);
        
        // Keep track of distribution results
        const results = [];
        
        // Set up a batch size to avoid rate limiting
        const BATCH_SIZE = 10;
        
        // Process rewards in batches
        for (let i = 0; i < rewards.length; i += BATCH_SIZE) {
            const batch = rewards.slice(i, i + BATCH_SIZE);
            console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(rewards.length / BATCH_SIZE)} (${batch.length} rewards)...`);
            
            // Process each reward in the batch
            const batchPromises = batch.map(async (reward, index) => {
                try {
                    console.log(`${i + index + 1}/${rewards.length}: Sending ${ethers.formatUnits(reward.tokenAmount, tokenDecimals)} ${tokenSymbol} to ${reward.buyer}...`);
                    
                    // Send the tokens
                    const tx = await tokenWithSigner.transfer(reward.buyer, reward.tokenAmount, {
                        gasLimit: 200000,
                        maxFeePerGas: ethers.parseUnits("20", "gwei"),
                        maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
                    });
                    
                    // Wait for confirmation
                    const receipt = await tx.wait();
                    
                    console.log(`✓ Success! Transaction hash: ${receipt.hash}`);
                    
                    return {
                        buyer: reward.buyer,
                        tokenAmount: ethers.formatUnits(reward.tokenAmount, tokenDecimals),
                        success: true,
                        transactionHash: receipt.hash
                    };
                } catch (error) {
                    console.error(`✗ Failed to send tokens to ${reward.buyer}: ${error.message}`);
                    
                    return {
                        buyer: reward.buyer,
                        tokenAmount: ethers.formatUnits(reward.tokenAmount, tokenDecimals),
                        success: false,
                        error: error.message
                    };
                }
            });
            
            // Wait for all transactions in the batch to complete
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Add a small delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < rewards.length) {
                console.log('Waiting 5 seconds before processing the next batch...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        // Save the results
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        
        console.log(`\n=== Distribution Complete ===`);
        console.log(`Successful transfers: ${successCount}/${results.length}`);
        console.log(`Failed transfers: ${failCount}/${results.length}`);
        
        // Save distribution results
        const resultsFilePath = path.join(distributionDir, `distribution-results-${timestamp}.json`);
        fs.writeFileSync(resultsFilePath, JSON.stringify({
            metadata: {
                ...distributionPlan.metadata,
                successCount,
                failCount
            },
            results
        }, null, 2));
        
        console.log(`\nDistribution results saved to: ${resultsFilePath}`);
        
        // Save failed transfers separately for retry if needed
        if (failCount > 0) {
            const failedRewards = results
                .filter(r => !r.success)
                .map(r => ({
                    buyer: r.buyer,
                    tokenAmount: r.tokenAmount,
                    error: r.error
                }));
            
            const failedFilePath = path.join(distributionDir, `distribution-failed-${timestamp}.json`);
            fs.writeFileSync(failedFilePath, JSON.stringify(failedRewards, null, 2));
            
            console.log(`Failed transfers saved to: ${failedFilePath}`);
            console.log('You can retry these transfers later by modifying this script or preparing a new distribution plan.');
        }
        
    } catch (error) {
        console.error("Error during token distribution:", error.message);
        if (error.error?.message) {
            console.error("Error details:", error.error.message);
        }
    } finally {
        rl.close();
    }
}

// Get ethers from hardhat
const { ethers } = hre;

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        rl.close();
        process.exit(1);
    });