//check-eth-price.js
require('dotenv').config();
const { ethers } = require("hardhat");
const axios = require('axios');

async function decodeAndProcessVAA(vaaBase64) {
    try {
        // Use Node.js Buffer for base64 decoding
        const vaaBytes = Buffer.from(vaaBase64, 'base64');
        
        // Comprehensive Pyth ABI for price feed updates
        const pythABI = [
            "function getUpdateFee(bytes[] calldata priceUpdates) external view returns (uint256)",
            "function updatePriceFeeds(bytes[] calldata priceUpdates) external payable",
            "function getPriceNoOlderThan(bytes32 id, uint256 maxAge) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))",
            // Add view function to check price feed existence
            "function priceFeedExists(bytes32 id) external view returns (bool)"
        ];

        // Network configuration
        const network = hre.network.name;
        const pythAddress = process.env['UNICHAIN_PYTH_ADDRESS'];
        const deployerPrivateKey = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;

        // Get provider and wallet
        const provider = new ethers.JsonRpcProvider(hre.network.config.url);
        const wallet = new ethers.Wallet(deployerPrivateKey, provider);

        // Create Pyth contract instance
        const pythContract = new ethers.Contract(pythAddress, pythABI, wallet);

        // Verify price feed exists
        const ethUsdPriceId = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';
        
        console.log('Checking price feed existence...');
        try {
            // Note: This might not be a standard Pyth contract method
            // You may need to remove this if the contract doesn't support this
            const feedExists = await pythContract.priceFeedExists(ethUsdPriceId);
            console.log('Price Feed Exists:', feedExists);
        } catch (existenceError) {
            console.warn('Could not check price feed existence:', existenceError.message);
        }

        // Calculate update fee
        const updateFee = await pythContract.getUpdateFee([vaaBytes]);
        console.log(`Update Fee: ${ethers.formatEther(updateFee)} ETH`);

        // Update price feeds
        console.log('Updating price feeds...');
        const updateTx = await pythContract.updatePriceFeeds([vaaBytes], { 
            value: updateFee 
        });
        await updateTx.wait();
        console.log('Price feeds updated successfully');

        // Retrieve and process the price
        console.log('Attempting to retrieve price...');
        try {
            const price = await pythContract.getPriceNoOlderThan(ethUsdPriceId, 60);
            
            // Detailed price analysis
            console.log("Price Details:");
            console.log(`Raw Price Value: ${price.price.toString()}`);
            console.log(`Confidence: ${price.conf.toString()}`);
            console.log(`Exponent: ${price.expo}`);
            
            // Convert price
            const priceInUSD = Number(price.price) * Math.pow(10, Number(price.expo));
            const publishTime = new Date(Number(price.publishTime) * 1000);
            
            console.log(`Converted Price: $${Math.abs(priceInUSD).toFixed(2)}`);
            console.log(`Publish Time: ${publishTime.toLocaleString()}`);
            
            // Confidence analysis
            const confidencePercentage = (Number(price.conf) / Math.abs(Number(price.price))) * 100;
            console.log(`Confidence Interval: ±${confidencePercentage.toFixed(2)}%`);
            
            // Age of the price
            const currentTime = new Date();
            const priceStaleness = (currentTime.getTime() - publishTime.getTime()) / 1000;
            console.log(`Price Age: ${priceStaleness.toFixed(2)} seconds`);

        } catch (priceRetrievalError) {
            console.error('Error retrieving price:', priceRetrievalError);
            console.error('Error Details:', {
                code: priceRetrievalError.code,
                data: priceRetrievalError.data,
                reason: priceRetrievalError.reason
            });
        }

    } catch (error) {
        console.error('Error processing VAA:', error);
        // Log the full error for more details
        console.error(error.stack);
    }
}

async function fetchPriceUpdate(priceIds) {
    const endpoints = [
        'https://hermes.pyth.network/api/latest_vaas',
        'https://hermes-beta.pyth.network/api/latest_vaas',
        'https://hermes.pyth.network/v2/updates/price'
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`Attempting to fetch from: ${endpoint}`);
            const response = await axios.get(endpoint, {
                params: { 
                    ids: priceIds,
                    network: 'mainnet'
                },
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json',
                }
            });
            
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch from ${endpoint}:`, 
                error.response ? 
                    `Status ${error.response.status}: ${JSON.stringify(error.response.data)}` : 
                    error.message
            );
        }
    }

    throw new Error('Unable to fetch price updates from any endpoint');
}

async function main() {
    try {
        const ethUsdPriceId = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';
        
        console.log('\n--- Fetching Price Update ---');
        const priceUpdates = await fetchPriceUpdate([ethUsdPriceId]);
        
        console.log('Raw price updates:', priceUpdates);

        // Process the first VAA (assuming a single VAA is returned)
        if (Array.isArray(priceUpdates) && priceUpdates.length > 0) {
            await decodeAndProcessVAA(priceUpdates[0]);
        }
    } catch (error) {
        console.error("Error in price retrieval:", error);
    }
}

module.exports = main;

// Only run main if this script is run directly (not imported)
if (require.main === module) {
    const hre = require("hardhat");
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}