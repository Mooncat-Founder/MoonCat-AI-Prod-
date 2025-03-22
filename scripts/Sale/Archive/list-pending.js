// scripts/sale/list-pending.js
const hre = require("hardhat");
const ethersLib = require("ethers");
const readline = require('readline');
const {
    getAddresses,
    loadPendingOperations,
    getContracts,
    loadSafeConfig,
    isOperationReady
} = require('./safe-timelock-operations');

// Timelock ABI (minimal for checking operation status)
const TIMELOCK_ABI = [
    "function isOperationReady(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)",
    "function isOperationPending(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)"
];

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify the question method
function question(query) {
    return new Promise(resolve => {
        rl.question(query, answer => {
            resolve(answer);
        });
    });
}

async function main() {
    try {
        // Get network addresses
        const addresses = await getAddresses();
        const { network, saleAddress, timelockAddress, safeAddress } = addresses;
        
        console.log("\n===== Pending Operations =====");
        console.log(`Network: ${network}`);
        
        // Load pending operations
        const pendingOperations = loadPendingOperations(network);
        
        if (pendingOperations.length === 0) {
            console.log(`\nNo pending operations found for network ${network}.`);
            rl.close();
            return;
        }
        
        // Create timelock contract instance to check operation status
        const provider = hre.ethers.provider;
        const timelockContract = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
        
        console.log(`\nFound ${pendingOperations.length} pending operations:`);
        
        // Check status of each operation
        for (let i = 0; i < pendingOperations.length; i++) {
            const op = pendingOperations[i];
            
            console.log(`\n${i + 1}. Operation ID: ${op.id}`);
            console.log(`   Type: ${op.type}`);
            console.log(`   Scheduled: ${new Date(op.scheduledAt).toLocaleString()}`);
            console.log(`   Executable after: ${new Date(op.executeAfter).toLocaleString()}`);
            
            // Check if operation is still pending
            const isPending = await timelockContract.isOperationPending(
                op.target, 
                op.value, 
                op.data, 
                op.predecessor, 
                op.salt
            );
            
            // Check if operation is ready for execution
            const isReady = await timelockContract.isOperationReady(
                op.target, 
                op.value, 
                op.data, 
                op.predecessor, 
                op.salt
            );
            
            // Check time status
            const now = new Date();
            const executeAfter = new Date(op.executeAfter);
            const isReadyTime = now > executeAfter;
            
            if (!isPending) {
                console.log(`   Status: ❌ Not pending (already executed or cancelled)`);
            } else if (isReady) {
                console.log(`   Status: ✅ READY for execution`);
            } else if (isReadyTime) {
                console.log(`   Status: ⚠️ Time condition met but not ready (check timelock config)`);
            } else {
                const timeLeft = executeAfter - now;
                console.log(`   Status: ⏳ Waiting - ${Math.ceil(timeLeft / 1000 / 60)} minutes left`);
            }
            
            // Add command to execute this operation
            console.log(`   To execute: node scripts/sale/pause.js ${op.type} --execute --id=${op.id}`);
        }
        
    } catch (error) {
        console.error(`\nError: ${error.message}`);
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