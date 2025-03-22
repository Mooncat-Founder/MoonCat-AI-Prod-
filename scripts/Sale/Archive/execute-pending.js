// scripts/sale/execute-pending.js
const hre = require("hardhat");
const ethersLib = require("ethers");
const readline = require('readline');
const {
    loadSafeConfig,
    getAddresses,
    getContracts,
    loadSafeSigners,
    executeGnosisSafeTransaction,
    isOperationReady,
    loadPendingOperations,
    updateOperationStatus,
    sleep
} = require('./safe-timelock-operations');

// Sale contract ABI (minimal for verification)
const SALE_ABI = [
    "function paused() external view returns (bool)"
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
        
        console.log("\n===== Execute Ready Operations =====");
        console.log(`Network: ${network}`);
        console.log(`Sale Contract: ${saleAddress}`);
        console.log(`Timelock: ${timelockAddress}`);
        console.log(`Safe: ${safeAddress}`);
        
        // Load configuration and contracts
        const safeConfig = loadSafeConfig(network);
        const contracts = await getContracts(saleAddress, timelockAddress, SALE_ABI);
        const safeSigners = loadSafeSigners(safeConfig);
        
        // Load pending operations
        const pendingOperations = loadPendingOperations(network);
        
        if (pendingOperations.length === 0) {
            console.log(`\nNo pending operations found for network ${network}.`);
            rl.close();
            return;
        }
        
        console.log(`\nFound ${pendingOperations.length} pending operations`);
        
        // Find operations that are ready to execute
        const readyOperations = [];
        
        for (const op of pendingOperations) {
            const isReady = await isOperationReady(
                contracts.timelock,
                op.target,
                op.value,
                op.data,
                op.predecessor,
                op.salt
            );
            
            if (isReady) {
                readyOperations.push(op);
                console.log(`\n✅ Operation ready: ${op.id} (${op.type})`);
                console.log(`   Scheduled: ${new Date(op.scheduledAt).toLocaleString()}`);
                console.log(`   Target: ${op.target}`);
            } else {
                // Check time status
                const now = new Date();
                const executeAfter = new Date(op.executeAfter);
                const isReadyTime = now > executeAfter;
                
                if (isReadyTime) {
                    console.log(`\n⚠️ Operation not ready despite time elapsed: ${op.id} (${op.type})`);
                } else {
                    const timeLeft = executeAfter - now;
                    console.log(`\n⏳ Operation not ready yet: ${op.id} (${op.type})`);
                    console.log(`   Time remaining: ${Math.ceil(timeLeft / 1000 / 60)} minutes`);
                }
            }
        }
        
        if (readyOperations.length === 0) {
            console.log("\nNo operations are ready for execution!");
            rl.close();
            return;
        }
        
        // Confirm execution with user
        const confirmation = await question(`\nFound ${readyOperations.length} operations ready for execution.\nDo you want to execute them all? (yes/no): `);
        
        if (confirmation.toLowerCase() !== 'yes') {
            console.log("Execution cancelled!");
            rl.close();
            return;
        }
        
        // Execute each ready operation
        for (const op of readyOperations) {
            console.log(`\n----- Executing operation ${op.id} (${op.type}) -----`);
            
            // Create timelock interface for the execute function
            const executeInterface = new ethersLib.Interface([
                "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable"
            ]);
            
            const executeData = executeInterface.encodeFunctionData("execute", [
                op.target,
                op.value,
                op.data,
                op.predecessor,
                op.salt
            ]);
            
            try {
                // Execute the operation
                const receipt = await executeGnosisSafeTransaction(
                    op.safeAddress,
                    op.timelockAddress,
                    executeData,
                    safeSigners,
                    safeConfig
                );
                
                console.log(`Operation executed successfully!`);
                
                // Add delay to allow blockchain to update
                await sleep(5000);
                
                // Update operation status
                updateOperationStatus(network, op.id, true);
                
            } catch (error) {
                console.error(`Error executing operation ${op.id}: ${error.message}`);
                
                // Ask if we should continue with other operations
                if (readyOperations.indexOf(op) < readyOperations.length - 1) {
                    const continueExecution = await question("Continue with remaining operations? (yes/no): ");
                    
                    if (continueExecution.toLowerCase() !== 'yes') {
                        console.log("Remaining executions cancelled!");
                        break;
                    }
                }
            }
        }
        
        console.log("\nExecution process completed!");
        
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