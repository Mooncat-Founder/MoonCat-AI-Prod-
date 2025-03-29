// scripts/extract-purchase-data-fixed.js
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

// Token Sale ABI for the relevant functions and events
const TOKEN_SALE_ABI = [
    "function totalEthRaised() external view returns (uint256)",
    "function totalUsdtRaised() external view returns (uint256)",
    "function ethContributions(address) external view returns (uint256)",
    "function usdtContributions(address) external view returns (uint256)",
    "function pendingTokens(address) external view returns (uint256)",
    "function mctToken() external view returns (address)",
    "function usdtToken() external view returns (address)",
    "function remainingTokens() external view returns (uint256)",
    "event TokensPurchased(address indexed buyer, uint256 amountUSD, uint256 tokenAmount)"
];

// ERC20 ABI for token info
const ERC20_ABI = [
    "function name() external view returns (string)",
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)"
];

// Helper function to safely convert BigInt to string for JSON
function bigIntToString(obj) {
    if (typeof obj === 'bigint') {
        return obj.toString();
    } else if (Array.isArray(obj)) {
        return obj.map(bigIntToString);
    } else if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = bigIntToString(obj[key]);
            }
        }
        return result;
    }
    return obj;
}

async function main() {
    try {
        // Get ethers from hardhat
        const { ethers } = hre;
        
        // Determine network
        const network = hre.network.name;
        console.log(`Running on network: ${network}`);
        console.log("Extracting purchase data from token sale contract...");

        // Get sale contract address from environment based on network
        let saleContractAddress;
        
        if (network.includes("mainnet")) {
            saleContractAddress = process.env["UNICHAIN-MAINNET_SALE_ADDRESS"];
        } else {
            saleContractAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_SALE_ADDRESS"];
        }

        if (!saleContractAddress) {
            throw new Error(`Missing sale contract address for ${network}`);
        }

        console.log('Sale Contract Address:', saleContractAddress);

        const provider = ethers.provider;
        
        // Connect to the sale contract
        const saleContract = new ethers.Contract(saleContractAddress, TOKEN_SALE_ABI, provider);
        
        // Get token addresses
        const mctTokenAddress = await saleContract.mctToken();
        const usdtTokenAddress = await saleContract.usdtToken();
        
        // Connect to the token contracts
        const mctContract = new ethers.Contract(mctTokenAddress, ERC20_ABI, provider);
        const usdtContract = new ethers.Contract(usdtTokenAddress, ERC20_ABI, provider);
        
        // Get token info
        const mctName = await mctContract.name();
        const mctSymbol = await mctContract.symbol();
        const mctDecimals = await mctContract.decimals();
        const usdtDecimals = await usdtContract.decimals();
        
        console.log(`\nToken Information:`);
        console.log(`MCT Token: ${mctName} (${mctSymbol}), Decimals: ${mctDecimals}`);
        console.log(`USDT Token Address: ${usdtTokenAddress}, Decimals: ${usdtDecimals}`);
        
        // Get the current sale status
        const totalEthRaised = await saleContract.totalEthRaised();
        const totalUsdtRaised = await saleContract.totalUsdtRaised();
        const remainingTokens = await saleContract.remainingTokens();
        
        // Format amounts for display
        const formattedEthRaised = ethers.formatEther(totalEthRaised);
        const formattedUsdtRaised = ethers.formatUnits(totalUsdtRaised, usdtDecimals);
        const formattedRemainingTokens = ethers.formatUnits(remainingTokens, mctDecimals);
        
        console.log(`\nSale Status:`);
        console.log(`Total ETH Raised: ${formattedEthRaised} ETH`);
        console.log(`Total USDT Raised: ${formattedUsdtRaised} USDT`);
        console.log(`Remaining Tokens: ${formattedRemainingTokens} ${mctSymbol}`);
        
        // Calculate approximate USD value with a placeholder ETH price
        // In a production environment, you would use a price oracle here
        const estimatedEthUsdPrice = 3500; // Replace with actual ETH/USD price
        const estimatedTotalUsdRaised = (
            parseFloat(formattedEthRaised) * estimatedEthUsdPrice + 
            parseFloat(formattedUsdtRaised)
        ).toFixed(2);
        
        console.log(`Estimated Total USD Raised: $${estimatedTotalUsdRaised}`);
        
        // Allow user to specify a custom block range
        console.log('\nEvent querying options:');
        console.log('1. Automatic (scan from estimated deployment block)');
        console.log('2. Manual (specify start and end blocks)');
        console.log('3. Manual (specify deployment block only)');
        
        const queryOption = await prompt('\nSelect an option (1-3): ');
        
        // Find the current block
        const currentBlock = await provider.getBlockNumber();
        console.log(`Current block number: ${currentBlock}`);
        
        let startBlock = 0;
        let endBlock = currentBlock;
        
        if (queryOption === '2') {
            // Manual block range
            startBlock = parseInt(await prompt('Enter start block number: '));
            endBlock = parseInt(await prompt('Enter end block number (or leave empty for current block): '));
            
            if (isNaN(endBlock) || endBlock === 0) {
                endBlock = currentBlock;
            }
            
            // Validate inputs
            if (isNaN(startBlock) || startBlock < 0 || startBlock > currentBlock) {
                throw new Error('Invalid start block number');
            }
            
            if (endBlock <= startBlock || endBlock > currentBlock) {
                throw new Error('Invalid end block number');
            }
            
        } else if (queryOption === '3') {
            // Manual deployment block
            startBlock = parseInt(await prompt('Enter contract deployment block number: '));
            
            // Validate input
            if (isNaN(startBlock) || startBlock < 0 || startBlock > currentBlock) {
                throw new Error('Invalid deployment block number');
            }
            
        } else {
            // Automatic - try to estimate a reasonable starting point
            // For testnet, we'll be more aggressive with the range
            if (network.includes('sepolia') || network.includes('testnet')) {
                startBlock = Math.max(0, currentBlock - 50000); // Look back 50,000 blocks on testnet
            } else {
                // For mainnet, we'll use a more conservative approach
                startBlock = Math.max(0, currentBlock - 20000); // Look back 20,000 blocks on mainnet
            }
            
            console.log(`Using automatic range: block ${startBlock} to ${currentBlock}`);
        }
        
        // Query for all TokensPurchased events
        console.log(`\nFetching all purchase events from block ${startBlock} to ${endBlock}...`);
        
        // Set up the filter
        const filter = saleContract.filters.TokensPurchased();
        
        // Fetch events in batches to avoid RPC limitations
        let BLOCK_BATCH_SIZE = 5000; // Default batch size
        
        // Ask for custom batch size
        const customBatchSize = await prompt(`Enter batch size for queries (default: ${BLOCK_BATCH_SIZE}): `);
        if (customBatchSize.trim() !== '') {
            const parsed = parseInt(customBatchSize);
            if (!isNaN(parsed) && parsed > 0) {
                BLOCK_BATCH_SIZE = parsed;
            }
        }
        
        let allEvents = [];
        let eventCount = 0;
        
        // Add a retry mechanism
        for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += BLOCK_BATCH_SIZE) {
            const toBlock = Math.min(fromBlock + BLOCK_BATCH_SIZE - 1, endBlock);
            console.log(`Fetching events from blocks ${fromBlock} to ${toBlock}...`);
            
            let retries = 3;
            let success = false;
            
            while (retries > 0 && !success) {
                try {
                    const events = await saleContract.queryFilter(filter, fromBlock, toBlock);
                    allEvents = [...allEvents, ...events];
                    eventCount += events.length;
                    console.log(`Found ${events.length} events in this batch. Total: ${eventCount}`);
                    success = true;
                } catch (error) {
                    retries--;
                    if (retries === 0) {
                        console.error(`Failed after retries. Error: ${error.message}`);
                        
                        // Ask if user wants to continue or skip this batch
                        const skipBatch = await prompt('Continue fetching next batches? (y/n): ');
                        if (skipBatch.toLowerCase() !== 'y') {
                            throw new Error('Query aborted by user');
                        }
                        success = true; // Continue with next batch
                    } else {
                        const batchSize = Math.floor(BLOCK_BATCH_SIZE / 2);
                        console.log(`Retry ${3 - retries}/3: Reducing batch size to ${batchSize}...`);
                        BLOCK_BATCH_SIZE = batchSize;
                        // Reset to try again with smaller batch
                        fromBlock -= BLOCK_BATCH_SIZE; 
                    }
                }
            }
        }
        
        console.log(`\nFound a total of ${allEvents.length} purchase events`);
        
        if (allEvents.length === 0) {
            console.log('No purchase events found in the specified block range.');
            
            // Create empty output files
            const outputDir = path.join(__dirname, '..', '..', 'data', 'analytics', 'purchase-data');
            
            // Create the directory if it doesn't exist
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const timestamp = Math.floor(Date.now() / 1000);
            const csvFilePath = path.join(outputDir, `purchase-data-${timestamp}.csv`);
            const jsonFilePath = path.join(outputDir, `purchase-data-${timestamp}.json`);
            
            // Create CSV header
            const csvContent = 'Order,Percentile,Date,Block,Transaction,Buyer,Amount USD,Token Amount,Total ETH,Total USDT,Total Pending Tokens\n';
            
            // Write empty files
            fs.writeFileSync(csvFilePath, csvContent);
            fs.writeFileSync(jsonFilePath, JSON.stringify({
                metadata: {
                    network,
                    saleContractAddress,
                    mctToken: {
                        address: mctTokenAddress,
                        name: mctName,
                        symbol: mctSymbol,
                        decimals: mctDecimals.toString()
                    },
                    usdtToken: {
                        address: usdtTokenAddress,
                        decimals: usdtDecimals.toString()
                    },
                    saleStatus: {
                        totalEthRaised: formattedEthRaised,
                        totalUsdtRaised: formattedUsdtRaised,
                        estimatedTotalUsdRaised,
                        remainingTokens: formattedRemainingTokens
                    },
                    uniqueBuyers: 0,
                    totalPurchases: 0,
                    blockRange: {
                        start: startBlock,
                        end: endBlock
                    }
                },
                purchases: []
            }, null, 2));
            
            console.log(`\nExported empty data files to:`);
            console.log(`CSV: ${csvFilePath}`);
            console.log(`JSON: ${jsonFilePath}`);
            
            rl.close();
            return;
        }
        
        // Process the events and create a complete purchase record
        const purchases = [];
        const uniqueBuyers = new Set();
        
        console.log('Processing purchase events...');
        console.log('This may take some time if there are many events...');
        
        // Use batch processing for events to avoid timeouts
        const EVENT_BATCH_SIZE = 20;
        
        for (let i = 0; i < allEvents.length; i += EVENT_BATCH_SIZE) {
            const eventBatch = allEvents.slice(i, i + EVENT_BATCH_SIZE);
            console.log(`Processing events ${i + 1} to ${Math.min(i + EVENT_BATCH_SIZE, allEvents.length)} of ${allEvents.length}...`);
            
            const processingPromises = eventBatch.map(async (event) => {
                try {
                    // Get the block for this event to get the timestamp
                    const block = await event.getBlock();
                    
                    // Get the buyer's current contribution amounts
                    const buyerAddress = event.args.buyer;
                    const ethContribution = await saleContract.ethContributions(buyerAddress);
                    const usdtContribution = await saleContract.usdtContributions(buyerAddress);
                    const pendingTokenAmount = await saleContract.pendingTokens(buyerAddress);
                    
                    // Format the amounts
                    const formattedEthContribution = ethers.formatEther(ethContribution);
                    const formattedUsdtContribution = ethers.formatUnits(usdtContribution, usdtDecimals);
                    const formattedTokenAmount = ethers.formatUnits(pendingTokenAmount, mctDecimals);
                    const formattedEventTokenAmount = ethers.formatUnits(event.args.tokenAmount, mctDecimals);
                    const formattedEventUsdAmount = ethers.formatUnits(event.args.amountUSD, usdtDecimals);
                    
                    // Return the processed purchase data
                    return {
                        timestamp: block.timestamp,
                        date: new Date(block.timestamp * 1000).toISOString(),
                        blockNumber: event.blockNumber,
                        transactionHash: event.transactionHash,
                        buyer: buyerAddress,
                        amountUSD: formattedEventUsdAmount,
                        tokenAmount: formattedEventTokenAmount,
                        totalEthContribution: formattedEthContribution,
                        totalUsdtContribution: formattedUsdtContribution,
                        totalPendingTokens: formattedTokenAmount
                    };
                } catch (error) {
                    console.error(`Error processing event ${event.transactionHash}:`, error.message);
                    // Return a placeholder for failed events
                    return null;
                }
            });
            
            const batchResults = await Promise.all(processingPromises);
            
            // Filter out failed events and add to purchases array
            const validResults = batchResults.filter(result => result !== null);
            purchases.push(...validResults);
            
            // Add buyers to unique set
            validResults.forEach(purchase => {
                uniqueBuyers.add(purchase.buyer);
            });
            
            // Update progress
            console.log(`Processed ${purchases.length}/${allEvents.length} events...`);
        }
        
        // Sort purchases by timestamp (earliest first)
        purchases.sort((a, b) => a.timestamp - b.timestamp);
        
        // Calculate the percentage of the way through the sale for each purchase
        const totalPurchases = purchases.length;
        purchases.forEach((purchase, index) => {
            purchase.purchaseOrder = index + 1;
            purchase.percentile = ((index + 1) / totalPurchases * 100).toFixed(2);
        });
        
        console.log(`\nUnique Buyers: ${uniqueBuyers.size}`);
        
        // Export the data to CSV and JSON files
        const outputDir = path.join(__dirname, '..', '..', 'data', 'analytics', 'purchase-data');
        
        // Create the directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const timestamp = Math.floor(Date.now() / 1000);
        const csvFilePath = path.join(outputDir, `purchase-data-${timestamp}.csv`);
        const jsonFilePath = path.join(outputDir, `purchase-data-${timestamp}.json`);
        
        // Create CSV content
        let csvContent = 'Order,Percentile,Date,Block,Transaction,Buyer,Amount USD,Token Amount,Total ETH,Total USDT,Total Pending Tokens\n';
        
        for (const purchase of purchases) {
            csvContent += `${purchase.purchaseOrder},${purchase.percentile}%,${purchase.date},${purchase.blockNumber},${purchase.transactionHash},${purchase.buyer},${purchase.amountUSD},${purchase.tokenAmount},${purchase.totalEthContribution},${purchase.totalUsdtContribution},${purchase.totalPendingTokens}\n`;
        }
        
        // Prepare JSON data with BigInt values converted to strings
        const jsonData = {
            metadata: {
                network,
                saleContractAddress,
                mctToken: {
                    address: mctTokenAddress,
                    name: mctName,
                    symbol: mctSymbol,
                    decimals: mctDecimals.toString()
                },
                usdtToken: {
                    address: usdtTokenAddress,
                    decimals: usdtDecimals.toString()
                },
                saleStatus: {
                    totalEthRaised: formattedEthRaised,
                    totalUsdtRaised: formattedUsdtRaised,
                    estimatedTotalUsdRaised,
                    remainingTokens: formattedRemainingTokens
                },
                uniqueBuyers: uniqueBuyers.size,
                totalPurchases: purchases.length,
                blockRange: {
                    start: startBlock,
                    end: endBlock
                }
            },
            purchases: purchases
        };
        
        // Write files
        fs.writeFileSync(csvFilePath, csvContent);
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
        
        console.log(`\nExported data to:`);
        console.log(`CSV: ${csvFilePath}`);
        console.log(`JSON: ${jsonFilePath}`);
        
        // Print example for first few purchases
        if (purchases.length > 0) {
            console.log('\nExample purchase data (first 5 entries):');
            for (let i = 0; i < Math.min(5, purchases.length); i++) {
                const purchase = purchases[i];
                console.log(`Order #${purchase.purchaseOrder} (${purchase.percentile}%): ${purchase.buyer} bought ${purchase.tokenAmount} tokens for $${purchase.amountUSD} on ${purchase.date}`);
            }
        }
        
        console.log(`\nDone! You can now use this data to plan your promotional distribution.`);
    } catch (error) {
        console.error("Error extracting purchase data:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    } finally {
        rl.close();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        rl.close();
        process.exit(1);
    });