// scripts/sale/safe-timelock-operations.js
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import core ethers library
const ethersLib = require("ethers");

// Extended Safe ABI
const SAFE_ABI = [
    "function nonce() public view returns (uint256)",
    "function getThreshold() public view returns (uint256)",
    "function domainSeparator() public view returns (bytes32)",
    "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes memory signatures) public payable returns (bool success)"
];

// TimeLock ABI for key functions
const TIMELOCK_ABI = [
    "function getMinDelay() external view returns (uint256)",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function PROPOSER_ROLE() external view returns (bytes32)",
    "function EXECUTOR_ROLE() external view returns (bytes32)",
    "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external",
    "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable",
    "function isOperationPending(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)",
    "function isOperationReady(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)"
];

// Helper function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        // Try fallback to old format
        const oldConfigPath = path.join(process.cwd(), 'multisig_keys.json');
        if (fs.existsSync(oldConfigPath)) {
            console.log(`Config file ${configFile} not found, falling back to multisig_keys.json`);
            const configData = fs.readFileSync(oldConfigPath, 'utf8');
            return JSON.parse(configData);
        }
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

// Generate a unique salt for a timelock operation
function generateSalt(operationName) {
    const timestamp = Math.floor(Date.now() / 1000);
    return ethersLib.keccak256(ethersLib.toUtf8Bytes(`${operationName}-${timestamp}`));
}

// Get network-specific addresses
async function getAddresses() {
    // Get network from hardhat
    const network = await hre.ethers.provider.getNetwork();
    const networkName = hre.network.name;
    const networkNameUpper = networkName.toUpperCase().replace(/-/g, '_');
    
    console.log(`Network: ${networkName} (Chain ID: ${network.chainId})`);
    
    // Get addresses from environment variables
    const saleAddress = process.env[`${networkNameUpper}_SALE_ADDRESS`] || 
                        process.env[`${networkNameUpper.replace(/_/g, '-')}_SALE_ADDRESS`];
    const timelockAddress = process.env[`${networkNameUpper}_SALE_TIMELOCK_ADDRESS`] || 
                           process.env[`${networkNameUpper.replace(/_/g, '-')}_SALE_TIMELOCK_ADDRESS`];
    const safeAddress = process.env[`${networkNameUpper}_TOKEN_SALE_SAFE`] || 
                       process.env[`${networkNameUpper.replace(/_/g, '-')}_TOKEN_SALE_SAFE`];
    
    if (!saleAddress || !timelockAddress || !safeAddress) {
        throw new Error(`Missing addresses in .env for network ${networkName}`);
    }
    
    return {
        network: networkName,
        saleAddress,
        timelockAddress,
        safeAddress
    };
}

// Get contract instances
async function getContracts(saleAddress, timelockAddress, saleABI) {
    const provider = hre.ethers.provider;
    
    // Create contract instances
    const saleContract = new ethers.Contract(saleAddress, saleABI, provider);
    const timelockContract = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
    
    return {
        sale: saleContract,
        timelock: timelockContract,
        provider
    };
}

// Load safe signers
function loadSafeSigners(safeConfig) {
    const provider = hre.ethers.provider;
    
    if (!safeConfig.signers || safeConfig.signers.length === 0) {
        throw new Error('No signers found in configuration');
    }
    
    const safeSigners = safeConfig.signers.map(key => {
        if (!key || key === '') {
            throw new Error('Empty signer key found in configuration');
        }
        return new ethersLib.Wallet(key, provider);
    });
    
    console.log(`Loaded ${safeSigners.length} Safe signers`);
    return safeSigners;
}

// Generate signature for Gnosis Safe transaction
async function generateSignature(signer, safeTx, domainSeparator) {
    const SAFE_TX_TYPEHASH = ethersLib.keccak256(
        ethersLib.toUtf8Bytes('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)')
    );

    const encodedData = ethersLib.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'address', 'uint256', 'bytes32', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
        [
            SAFE_TX_TYPEHASH,
            safeTx.to,
            safeTx.value,
            ethersLib.keccak256(safeTx.data),
            safeTx.operation,
            safeTx.safeTxGas,
            safeTx.baseGas,
            safeTx.gasPrice,
            safeTx.gasToken,
            safeTx.refundReceiver,
            safeTx.nonce
        ]
    );

    const encodedTransactionData = ethersLib.keccak256(encodedData);
    const finalHash = ethersLib.keccak256(
        ethersLib.concat([
            '0x1901',
            domainSeparator,
            encodedTransactionData
        ])
    );

    const signature = await signer.signMessage(ethersLib.getBytes(finalHash));
    const sig = ethersLib.Signature.from(signature);

    return {
        signer: signer.address,
        data: ethersLib.hexlify(
            ethersLib.concat([
                sig.r,
                sig.s,
                ethersLib.toBeHex(sig.v + 4, 1)
            ])
        )
    };
}

// Execute transaction through Gnosis Safe
async function executeGnosisSafeTransaction(safeAddress, targetAddress, calldata, signers, safeConfig, forcedNonce = null) {
    console.log(`Executing transaction through Safe ${safeAddress} to target ${targetAddress}`);
    console.log(`Calldata: ${calldata.slice(0, 66)}...`);
    
    // Get network info first to confirm we're on the right network
    const provider = hre.ethers.provider;
    const network = await provider.getNetwork();
    console.log(`Network: ${network.name || 'unknown'}, Chain ID: ${network.chainId}`);
    
    // Check if the contract at the safe address exists
    const code = await provider.getCode(safeAddress);
    if (code === '0x') {
        throw new Error(`No contract found at Safe address ${safeAddress}`);
    }
    
    console.log("Contract found at Safe address. Proceeding with transaction...");
    
    // Check balance
    const balance = await provider.getBalance(safeAddress);
    console.log(`Safe balance: ${ethersLib.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
        throw new Error(`Safe has no ETH for gas. Please send ETH to ${safeAddress}`);
    }
    
    // Create contract instance
    const safeContract = new ethersLib.Contract(safeAddress, SAFE_ABI, provider);
    
    // Get Safe details directly from the contract
    let nonce, threshold, domainSeparator;
    try {
        // Use provided nonce if available, otherwise get from contract
        nonce = forcedNonce !== null ? forcedNonce : await safeContract.nonce();
        threshold = await safeContract.getThreshold();
        domainSeparator = await safeContract.domainSeparator();
        
        console.log('Current Safe nonce:', nonce.toString());
        console.log('Required threshold:', threshold.toString());
    } catch (error) {
        console.error(`Error retrieving Safe details: ${error.message}`);
        console.log("Falling back to default values...");
        
        // Fallback values
        nonce = forcedNonce !== null ? forcedNonce : 0n;
        
        // Get threshold from configuration
        if (safeConfig.safeConfig && safeConfig.safeConfig.threshold) {
            threshold = BigInt(safeConfig.safeConfig.threshold);
        } else {
            threshold = BigInt(2); // Default to 2 if not specified
        }
        
        // Calculate domain separator manually
        const chainId = network.chainId;
        domainSeparator = ethersLib.keccak256(
            ethersLib.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address'],
                [
                    ethersLib.keccak256(ethersLib.toUtf8Bytes('EIP712Domain(address verifyingContract)')),
                    safeAddress
                ]
            )
        );
        
        console.log('Using fallback values:');
        console.log('Nonce (assumed):', nonce.toString());
        console.log('Threshold (from config):', threshold.toString());
    }
    
    if (signers.length < threshold) {
        throw new Error(`Not enough signers. Need ${threshold}, have ${signers.length}`);
    }
    
    const safeTx = {
        to: targetAddress,
        value: 0n,
        data: calldata,
        operation: 0,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: ethersLib.ZeroAddress,
        refundReceiver: ethersLib.ZeroAddress,
        nonce: nonce
    };
    
    console.log('Collecting signatures...');
    
    let signatures = [];
    for (let i = 0; i < threshold.toString(); i++) {
        console.log(`Getting signature from signer ${i + 1}...`);
        const signature = await generateSignature(signers[i], safeTx, domainSeparator);
        signatures.push(signature);
    }
    
    signatures.sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
    const signatureBytes = "0x" + signatures.map(sig => sig.data.slice(2)).join("");
    
    try {
        console.log('Executing transaction...');
        
        // Use direct contract call
        const tx = await safeContract.connect(signers[0]).execTransaction(
            safeTx.to,
            safeTx.value,
            safeTx.data,
            safeTx.operation,
            safeTx.safeTxGas,
            safeTx.baseGas,
            safeTx.gasPrice,
            safeTx.gasToken,
            safeTx.refundReceiver,
            signatureBytes,
            { 
                gasLimit: 500000,
                maxFeePerGas: ethersLib.parseUnits("20", "gwei"),
                maxPriorityFeePerGas: ethersLib.parseUnits("2", "gwei")
            }
        );
        
        console.log('Waiting for transaction confirmation...');
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('Transaction executed successfully!');
            console.log('Transaction hash:', receipt.hash);
        } else {
            throw new Error('Transaction failed');
        }
        
        return receipt;
    } catch (error) {
        // Check if it's "already known" error (transaction was already submitted)
        if (error.message.includes("already known")) {
            console.log("Transaction was already submitted and is pending. Continuing...");
            
            // Wait for the transaction to be mined
            await sleep(15000); // Wait 15 seconds
            console.log("Assuming transaction was processed. Continuing...");
            return { status: 1, hash: "unknown (transaction was already known)" };
        }
        
        console.error('Error executing transaction:', error.message);
        if (error.error?.message) {
            console.error('Error details:', error.error.message);
        }
        throw error;
    }
}

// Check if a timelock operation is pending
async function isOperationPending(timelockContract, target, value, data, predecessor, salt) {
    try {
        // Check if operation is pending
        const isPending = await timelockContract.isOperationPending(target, value, data, predecessor, salt);
        return isPending;
    } catch (error) {
        console.log(`Error checking if operation is pending: ${error.message}`);
        return false;
    }
}

// Check if a timelock operation is ready for execution
async function isOperationReady(timelockContract, target, value, data, predecessor, salt) {
    try {
        // Check if operation is ready
        const isReady = await timelockContract.isOperationReady(target, value, data, predecessor, salt);
        return isReady;
    } catch (error) {
        console.log(`Error checking if operation is ready: ${error.message}`);
        return false;
    }
}

// Save operation details to tracking file
function saveOperation(operation) {
    const operationsDir = path.resolve(process.cwd(), 'operations');
    
    // Create operations directory if it doesn't exist
    if (!fs.existsSync(operationsDir)) {
        fs.mkdirSync(operationsDir, { recursive: true });
    }
    
    const operationsFile = path.join(operationsDir, `${operation.network}.json`);
    
    // Load existing operations or create empty array
    let operations = [];
    if (fs.existsSync(operationsFile)) {
        const fileContent = fs.readFileSync(operationsFile, 'utf8');
        try {
            operations = JSON.parse(fileContent);
        } catch (error) {
            console.error(`Error parsing operations file: ${error.message}`);
        }
    }
    
    // Add new operation
    operations.push(operation);
    
    // Save updated operations
    fs.writeFileSync(operationsFile, JSON.stringify(operations, null, 2));
    console.log(`Operation saved to ${operationsFile}`);
}

// Load pending operations
function loadPendingOperations(network) {
    const operationsFile = path.resolve(process.cwd(), 'operations', `${network}.json`);
    
    if (!fs.existsSync(operationsFile)) {
        return [];
    }
    
    try {
        const fileContent = fs.readFileSync(operationsFile, 'utf8');
        const operations = JSON.parse(fileContent);
        
        // Filter operations that are still pending
        return operations.filter(op => !op.executed);
    } catch (error) {
        console.error(`Error loading operations: ${error.message}`);
        return [];
    }
}

// Update operation status
function updateOperationStatus(network, operationId, executed = true) {
    const operationsFile = path.resolve(process.cwd(), 'operations', `${network}.json`);
    
    if (!fs.existsSync(operationsFile)) {
        console.error(`Operations file for network ${network} not found`);
        return false;
    }
    
    try {
        const fileContent = fs.readFileSync(operationsFile, 'utf8');
        const operations = JSON.parse(fileContent);
        
        // Find and update operation
        const operation = operations.find(op => op.id === operationId);
        if (!operation) {
            console.error(`Operation with id ${operationId} not found`);
            return false;
        }
        
        operation.executed = executed;
        operation.executedAt = new Date().toISOString();
        
        // Save updated operations
        fs.writeFileSync(operationsFile, JSON.stringify(operations, null, 2));
        console.log(`Operation ${operationId} marked as executed`);
        return true;
    } catch (error) {
        console.error(`Error updating operation status: ${error.message}`);
        return false;
    }
}

module.exports = {
    loadSafeConfig,
    generateSalt,
    getAddresses,
    getContracts,
    loadSafeSigners,
    executeGnosisSafeTransaction,
    isOperationPending,
    isOperationReady,
    saveOperation,
    loadPendingOperations,
    updateOperationStatus,
    sleep
};