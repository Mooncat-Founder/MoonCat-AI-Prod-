// scripts/check-safe-addresses.js
const hre = require("hardhat");
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Safe ABI for getting owners and threshold
const SAFE_ABI = [
    "function getThreshold() view returns (uint256)",
    "function getOwners() view returns (address[])",
    "function isOwner(address owner) view returns (bool)",
    "function nonce() view returns (uint256)"
];

// Load environment-based configuration file
function loadSafeConfig(network) {
    // Map network names to environment keys
    const networkToEnv = {
        'unichain-sepolia-testnet': 'test',
        'UNICHAIN_SEPOLIA_TESTNET': 'test',
        'unichain-mainnet': 'prod',
        'UNICHAIN_MAINNET': 'prod'
    };
    
    // Get environment key from network name
    const env = networkToEnv[network] || 'test';
    
    // Determine config file path
    const configFile = path.resolve(process.cwd(), `keys.${env}.json`);
    
    // Check if file exists
    if (!fs.existsSync(configFile)) {
        throw new Error(`Configuration file not found: ${configFile}`);
    }
    
    // Load and parse the config file
    try {
        const configData = fs.readFileSync(configFile, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
}

async function main() {
    console.log("\n===== Checking Gnosis Safe Addresses =====");
    
    // Get network from hardhat
    const network = await hre.ethers.provider.getNetwork();
    const networkName = hre.network.name;
    const networkNameUpper = networkName.toUpperCase().replace(/-/g, '_');
    
    console.log(`Network: ${networkName} (Chain ID: ${network.chainId})`);
    
    // Try to load the safe configuration
    let safeConfig;
    try {
        safeConfig = loadSafeConfig(networkName);
        console.log(`Successfully loaded keys.${networkName === 'unichain-sepolia-testnet' ? 'test' : 'prod'}.json`);
    } catch (error) {
        console.error(`Config file error: ${error.message}`);
        
        // Check if the old config exists as a fallback
        try {
            const oldConfigPath = path.join(process.cwd(), 'multisig_keys.json');
            safeConfig = require(oldConfigPath);
            console.log("Loaded from fallback multisig_keys.json");
        } catch (fallbackError) {
            console.error(`Fallback config error: ${fallbackError.message}`);
            console.log("Will continue with on-chain data only");
        }
    }
    
    // Get Safe addresses from environment variables
    // Check both underscore and dash formats
    const networkNameWithDash = networkNameUpper.replace(/_/g, '-');
    
    // Try different variable name formats
    const tokenSafeAddress = 
        process.env[`${networkNameUpper}_MOONCAT_TOKEN_SAFE`] || 
        process.env[`${networkNameWithDash}_MOONCAT_TOKEN_SAFE`];
    
    const stakingSafeAddress = 
        process.env[`${networkNameUpper}_MOONCAT_STAKING_SAFE`] || 
        process.env[`${networkNameWithDash}_MOONCAT_STAKING_SAFE`];
    
    const saleSafeAddress = 
        process.env[`${networkNameUpper}_TOKEN_SALE_SAFE`] || 
        process.env[`${networkNameWithDash}_TOKEN_SALE_SAFE`];
    
    // Display config from loaded file if available
    if (safeConfig) {
        console.log("\n===== Safe Configuration from Config File =====");
        if (safeConfig.safeConfig) {
            console.log(`Threshold: ${safeConfig.safeConfig.threshold}`);
            console.log(`Registered Owners (${safeConfig.safeConfig.owners.length}):`);
            safeConfig.safeConfig.owners.forEach((owner, index) => {
                console.log(`  ${index + 1}. ${owner}`);
            });
        } else {
            console.log(`Using legacy format. Found ${safeConfig.signers?.length || 0} signers.`);
        }
    }
    
    console.log("\n===== Safe Addresses from Environment =====");
    
    // Show the variable names we're looking for
    const tokenVarName = `${networkNameUpper}_MOONCAT_TOKEN_SAFE`;
    const stakingVarName = `${networkNameUpper}_MOONCAT_STAKING_SAFE`;
    const saleVarName = `${networkNameUpper}_TOKEN_SALE_SAFE`;
    
    const dashTokenVarName = `${networkNameWithDash}_MOONCAT_TOKEN_SAFE`;
    const dashStakingVarName = `${networkNameWithDash}_MOONCAT_STAKING_SAFE`;
    const dashSaleVarName = `${networkNameWithDash}_TOKEN_SALE_SAFE`;
    
    console.log(`\nLooking for these environment variables:`);
    console.log(`1. ${tokenVarName} or ${dashTokenVarName}`);
    console.log(`2. ${stakingVarName} or ${dashStakingVarName}`);
    console.log(`3. ${saleVarName} or ${dashSaleVarName}`);
    
    console.log(`\nFound values:`);
    console.log(`Token Safe: ${tokenSafeAddress || 'Not defined'}`);
    console.log(`Staking Safe: ${stakingSafeAddress || 'Not defined'}`);
    console.log(`Sale Safe: ${saleSafeAddress || 'Not defined'}`);
    
    // Let's check if any other formats exist by looking for partial matches
    console.log("\nSearching for alternative variable formats...");
    const envVars = Object.keys(process.env).filter(key => 
        key.includes("TOKEN_SAFE") || 
        key.includes("STAKING_SAFE") ||
        key.includes("SALE_SAFE")
    );
    
    if (envVars.length > 0) {
        console.log("Found these related environment variables:");
        envVars.forEach(key => {
            console.log(`- ${key}: ${process.env[key]}`);
        });
    } else {
        console.log("No alternative environment variables found.");
    }
    
    // Get Safe details from on-chain data
    const provider = hre.ethers.provider;
    
    // List of Safes to check
    const safesToCheck = [
        { name: "Token Safe", address: tokenSafeAddress },
        { name: "Staking Safe", address: stakingSafeAddress },
        { name: "Sale Safe", address: saleSafeAddress }
    ];
    
    console.log("\n===== On-Chain Safe Information =====");
    
    for (const safe of safesToCheck) {
        if (!safe.address) {
            console.log(`\n${safe.name}: Address not defined`);
            continue;
        }
        
        console.log(`\n${safe.name} (${safe.address}):`);
        
        try {
            // Check if contract exists at this address
            const code = await provider.getCode(safe.address);
            if (code === "0x" || code === "") {
                console.log(`  ❌ No contract found at this address!`);
                continue;
            }
            
            // Create contract instance
            const safeContract = new ethers.Contract(safe.address, SAFE_ABI, provider);
            
            try {
                // Get threshold
                const threshold = await safeContract.getThreshold();
                console.log(`  Threshold: ${threshold.toString()}`);
                
                // Get owners
                const owners = await safeContract.getOwners();
                console.log(`  Owners (${owners.length}):`);
                owners.forEach((owner, index) => {
                    console.log(`    ${index + 1}. ${owner}`);
                });
                
                // Get nonce (transaction count)
                try {
                    const nonce = await safeContract.nonce();
                    console.log(`  Current nonce: ${nonce.toString()} (${nonce} transactions executed)`);
                } catch (error) {
                    console.log(`  Could not retrieve nonce: ${error.message}`);
                }
                
                // Check if owners in config match those on-chain
                if (safeConfig && safeConfig.safeConfig) {
                    console.log(`\n  Config owners verification:`);
                    
                    // Check if threshold matches
                    if (threshold.toString() === safeConfig.safeConfig.threshold.toString()) {
                        console.log(`  ✅ Threshold matches configuration (${threshold})`);
                    } else {
                        console.log(`  ❌ Threshold MISMATCH!`);
                        console.log(`     On-chain: ${threshold}`);
                        console.log(`     Config: ${safeConfig.safeConfig.threshold}`);
                    }
                    
                    // Compare owner lists
                    const configOwners = safeConfig.safeConfig.owners.map(address => address.toLowerCase());
                    const chainOwners = owners.map(address => address.toLowerCase());
                    
                    let allOwnersMatch = true;
                    
                    // Check if all config owners are on-chain
                    for (const configOwner of configOwners) {
                        if (chainOwners.includes(configOwner)) {
                            console.log(`  ✅ Config owner ${configOwner} found on-chain`);
                        } else {
                            console.log(`  ❌ Config owner ${configOwner} NOT found on-chain!`);
                            allOwnersMatch = false;
                        }
                    }
                    
                    // Check if all on-chain owners are in config
                    for (const chainOwner of chainOwners) {
                        if (!configOwners.includes(chainOwner)) {
                            console.log(`  ⚠️ On-chain owner ${chainOwner} NOT in config file!`);
                            allOwnersMatch = false;
                        }
                    }
                    
                    if (allOwnersMatch && configOwners.length === chainOwners.length) {
                        console.log(`  ✅ All owners match between config and on-chain`);
                    }
                }
                
            } catch (error) {
                console.log(`  Error retrieving Safe details: ${error.message}`);
            }
            
        } catch (error) {
            console.log(`  Error connecting to Safe: ${error.message}`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });