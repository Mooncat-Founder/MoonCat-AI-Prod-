// multisig-config.js
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Load multisig configuration based on network
 * @param {string} network - Network name (e.g., 'unichain-sepolia-testnet', 'unichain-mainnet')
 * @returns {object} Multisig configuration for the specified network
 */
function loadMultisigConfig(network) {
  // Map Hardhat network names to environment keys
  const networkToEnv = {
    'unichain-sepolia-testnet': 'test',
    'unichain-mainnet': 'prod'
  };
  
  // Get environment key from network name
  const env = networkToEnv[network] || 'test';
  
  // Load the appropriate configuration file
  try {
    const configFile = path.resolve(__dirname, `keys.${env}.json`);
    
    if (!fs.existsSync(configFile)) {
      throw new Error(`Configuration file not found: ${configFile}`);
    }
    
    const configData = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(`Failed to load multisig configuration: ${error.message}`);
  }
}

/**
 * Get contract addresses for the specified network from environment variables
 * @param {string} network - Network name 
 * @returns {object} Contract addresses for the specified network
 */
function getContractAddresses(network) {
  // Create network-specific prefix for environment variables
  // Replace hyphens with underscores for environment variable format
  const prefix = network.replace(/-/g, '_').toUpperCase();
  
  // Build address object from environment variables
  return {
    token: process.env[`${prefix}_MCT_ADDRESS`],
    staking: process.env[`${prefix}_STAKING_ADDRESS`],
    sale: process.env[`${prefix}_SALE_ADDRESS`],
    usdt: process.env[`${prefix}_USDT_ADDRESS`],
    stakingTimelock: process.env[`${prefix}_STAKING_TIMELOCK_ADDRESS`],
    saleTimelock: process.env[`${prefix}_SALE_TIMELOCK_ADDRESS`],
    tokenSafe: process.env[`${prefix}_MOONCAT_TOKEN_SAFE`],
    stakingSafe: process.env[`${prefix}_MOONCAT_STAKING_SAFE`],
    saleSafe: process.env[`${prefix}_TOKEN_SALE_SAFE`],
    // Add Pyth info for mainnet
    pyth: network === 'unichain-mainnet' ? process.env.UNICHAIN_PYTH_ADDRESS : null,
    ethUsdPriceFeed: network === 'unichain-mainnet' ? process.env.ETH_USD_PRICE_FEED : null,
  };
}

/**
 * Get network RPC URL from environment variables
 * @param {string} network - Network name 
 * @returns {string} RPC URL for the specified network
 */
function getNetworkRPC(network) {
  if (network === 'unichain-sepolia-testnet') {
    return process.env.SEPOLIA_RPC_URL;
  } else if (network === 'unichain-mainnet') {
    return process.env.MAINNET_RPC_URL;
  }
  
  throw new Error(`No RPC URL configured for network: ${network}`);
}

/**
 * Get deployer private key from environment variables
 * @param {string} network - Network name 
 * @returns {string} Deployer private key for the specified network
 */
function getDeployerKey(network) {
  if (network === 'unichain-sepolia-testnet') {
    return process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  } else if (network === 'unichain-mainnet') {
    return process.env.MAINNET_DEPLOYER_PRIVATE_KEY;
  }
  
  throw new Error(`No deployer key configured for network: ${network}`);
}

/**
 * Get sale parameters from environment variables
 * @returns {object} Sale parameters
 */
function getSaleParams() {
  return {
    treasuryWallet: process.env.TREASURY_WALLET,
    raiseGoal: process.env.RAISE_GOAL,
    tokenPrice: process.env.TOKEN_PRICE,
    minContribution: process.env.MIN_CONTRIBUTION,
    maxContribution: process.env.MAX_CONTRIBUTION,
  };
}

/**
 * Get timelock parameters
 * @returns {object} Timelock parameters
 */
function getTimelockParams() {
  return {
    delay: process.env.TIMELOCK_DELAY,
  };
}

/**
 * Get role constants for contracts
 * @returns {object} Role constants
 */
function getRoleConstants() {
  return {
    defaultAdminRole: process.env.DEFAULT_ADMIN_ROLE_HASH,
    governorRole: process.env.GOVERNOR_ROLE_HASH,
    pauserRole: process.env.PAUSER_ROLE_HASH,
  };
}

module.exports = {
  loadMultisigConfig,
  getContractAddresses,
  getNetworkRPC,
  getDeployerKey,
  getSaleParams,
  getTimelockParams,
  getRoleConstants
};