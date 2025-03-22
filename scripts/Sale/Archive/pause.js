// scripts/sale/pause.js
const hre = require("hardhat");
const ethersLib = require("ethers");
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');
const {
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
} = require('./safe-timelock-operations');

// Sale contract ABI (minimal for pause/unpause)
const SALE_ABI = [
    "function owner() external view returns (address)",
    "function paused() external view returns (bool)",
    "function pause() external",
    "function unpause() external"
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

// Check if required roles are present
async function checkRoles(timelockContract, safeAddress) {
    console.log("\nChecking if Safe has required roles on timelock...");
    
    const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();
    
    const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, safeAddress);
    const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, safeAddress);
    
    console.log(`Safe has PROPOSER_ROLE: ${hasProposerRole}`);
    console.log(`Safe has EXECUTOR_ROLE: ${hasExecutorRole}`);
    
    if (!hasProposerRole || !hasExecutorRole) {
        throw new Error("Safe is missing required roles on timelock! Cannot proceed.");
    }
}

// Check if timelock is the owner of the contract
async function checkOwnership(saleContract, timelockAddress) {
    console.log("\nChecking if timelock is the owner of the sale contract...");
    
    const owner = await saleContract.owner();
    const isOwner = owner.toLowerCase() === timelockAddress.toLowerCase();
    
    console.log(`Sale contract owner: ${owner}`);
    console.log(`Timelock is owner: ${isOwner}`);
    
    if (!isOwner) {
        throw new Error("Timelock is not the owner of the sale contract! Cannot proceed.");
    }
}

// Schedule a pause/unpause operation
async function scheduleOperation(action, contracts, addresses, safeSigners, safeConfig) {
    const { sale: saleContract, timelock: timelockContract } = contracts;
    const { saleAddress, timelockAddress, safeAddress, network } = addresses;
    
    // Get current state
    const isPaused = await saleContract.paused();
    
    // Validate the action against current state
    if (action === 'pause' && isPaused) {
        console.log("Contract is already paused!");
        return null;
    } else if (action === 'unpause' && !isPaused) {
        console.log("Contract is already unpaused!");
        return null;
    }
    
    console.log(`\nScheduling ${action} operation...`);
    
    // Create calldata for pause/unpause
    const saleInterface = new ethersLib.Interface(SALE_ABI);
    const functionData = saleInterface.encodeFunctionData(action, []);
    
    // Get minimum delay from timelock
    const delay = await timelockContract.getMinDelay();
    console.log(`Timelock minimum delay: ${ethersLib.formatUnits(delay, 0)} seconds (${Number(delay) / 3600} hours)`);
    
    // Create a unique salt for this operation
    const salt = generateSalt(action);
    
    // Create timelock interface for the schedule function
    const timelockInterface = new ethersLib.Interface([
        "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external"
    ]);
    
    const scheduleData = timelockInterface.encodeFunctionData("schedule", [
        saleAddress,
        0,
        functionData,
        ethersLib.ZeroHash, // predecessor
        salt,
        delay
    ]);
    
    // Confirm operation with user
    const confirmation = await question(`\nYou are about to schedule a ${action} operation on network ${network}.\nThis will ${action === 'pause' ? 'disable' : 'enable'} token purchases.\nType 'yes' to continue: `);
    
    if (confirmation.toLowerCase() !== 'yes') {
        console.log("Operation cancelled!");
        rl.close();
        return null;
    }
    
    // Execute the schedule transaction through the Safe
    const receipt = await executeGnosisSafeTransaction(
        safeAddress, 
        timelockAddress, 
        scheduleData, 
        safeSigners,
        safeConfig
    );
    
    // Verify the operation was scheduled successfully
    const isPending = await isOperationPending(
        timelockContract, 
        saleAddress, 
        0, 
        functionData, 
        ethersLib.ZeroHash, 
        salt
    );
    
    console.log(`Operation is pending: ${isPending}`);
    
    if (!isPending) {
        console.log("Operation does not appear to be pending. It might have failed.");
        rl.close();
        return null;
    }
    
    // Calculate when the operation can be executed
    const timestamp = Math.floor(Date.now() / 1000);
    const executeAfter = timestamp + Number(delay);
    const executeDate = new Date(executeAfter * 1000);
    
    console.log(`\nOperation scheduled successfully!`);
    console.log(`Can be executed after: ${executeDate.toLocaleString()}`);
    
    // Save operation details for later execution
    const operation = {
        id: uuidv4(),
        network,
        type: action,
        target: saleAddress,
        value: 0,
        data: functionData,
        predecessor: ethersLib.ZeroHash,
        salt,
        timelockAddress,
        safeAddress,
        scheduledAt: new Date().toISOString(),
        executeAfter: executeDate.toISOString(),
        executed: false
    };
    
    saveOperation(operation);
    console.log(`\nOperation saved with ID: ${operation.id}`);
    
    rl.close();
    return operation;
}

// Execute a scheduled operation
async function executeOperation(operationId, contracts, addresses, safeSigners, safeConfig) {
    const { timelock: timelockContract, sale: saleContract } = contracts;
    const { network } = addresses;
    
    // Load pending operations
    const pendingOperations = loadPendingOperations(network);
    
    // Find operation by ID
    const operation = pendingOperations.find(op => op.id === operationId);
    if (!operation) {
        console.log(`No pending operation found with ID: ${operationId}`);
        rl.close();
        return false;
    }
    
    console.log(`\nFound operation: ${operation.type} scheduled on ${new Date(operation.scheduledAt).toLocaleString()}`);
    console.log(`Can be executed after: ${new Date(operation.executeAfter).toLocaleString()}`);
    
    // Check if operation is ready
    const isReady = await isOperationReady(
        timelockContract, 
        operation.target, 
        operation.value, 
        operation.data, 
        operation.predecessor, 
        operation.salt
    );
    
    console.log(`Operation is ready for execution: ${isReady}`);
    
    if (!isReady) {
        // Check how much time is left
        const now = new Date();
        const executeAfter = new Date(operation.executeAfter);
        const timeLeft = executeAfter - now;
        
        if (timeLeft > 0) {
            console.log(`Need to wait approximately ${Math.ceil(timeLeft / 1000 / 60)} more minutes.`);
            const shouldWait = await question("Do you want to wait for the operation to be ready? (yes/no): ");
            
            if (shouldWait.toLowerCase() === 'yes') {
                console.log(`Waiting for ${Math.ceil(timeLeft / 1000)} seconds...`);
                await sleep(timeLeft + 5000); // Add a small buffer
                console.log("Done waiting, attempting execution...");
            } else {
                console.log("Execution cancelled!");
                rl.close();
                return false;
            }
        } else {
            console.log("Operation should be ready but isn't. Attempting execution anyway...");
        }
    }
    
    // Confirm execution with user
    const confirmation = await question(`\nYou are about to execute a ${operation.type} operation on network ${network}.\nThis will ${operation.type === 'pause' ? 'disable' : 'enable'} token purchases.\nType 'yes' to continue: `);
    
    if (confirmation.toLowerCase() !== 'yes') {
        console.log("Execution cancelled!");
        rl.close();
        return false;
    }
    
    // Create timelock interface for the execute function
    const executeInterface = new ethersLib.Interface([
        "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable"
    ]);
    
    const executeData = executeInterface.encodeFunctionData("execute", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt
    ]);
    
    // Execute the operation
    try {
        const receipt = await executeGnosisSafeTransaction(
            operation.safeAddress, 
            operation.timelockAddress, 
            executeData, 
            safeSigners,
            safeConfig
        );
        
        console.log(`\n${operation.type} operation executed successfully!`);
        
        // Add delay to allow blockchain to update
        await sleep(10000);
        
        // Verify the new state
        const newPausedState = await saleContract.paused();
        const expectedState = operation.type === 'pause';
        
        console.log(`\nVerifying new paused state - expected: ${expectedState}, actual: ${newPausedState}`);
        
        if (newPausedState === expectedState) {
            console.log(`✅ Contract ${operation.type === 'pause' ? 'paused' : 'unpaused'} successfully through the timelock!`);
            
            // Update operation status
            updateOperationStatus(network, operation.id, true);
            
            rl.close();
            return true;
        } else {
            console.log(`❌ State was not set correctly. Please check the transaction details.`);
            rl.close();
            return false;
        }
    } catch (error) {
        console.error("Error executing operation:", error.message);
        rl.close();
        return false;
    }
}

// List all pending operations
async function listPendingOperations(network) {
    const pendingOperations = loadPendingOperations(network);
    
    if (pendingOperations.length === 0) {
        console.log(`\nNo pending operations found for network ${network}.`);
        rl.close();
        return;
    }
    
    console.log(`\n===== Pending Operations for ${network} =====`);
    pendingOperations.forEach((op, index) => {
        console.log(`\n${index + 1}. Operation ID: ${op.id}`);
        console.log(`   Type: ${op.type}`);
        console.log(`   Scheduled: ${new Date(op.scheduledAt).toLocaleString()}`);
        console.log(`   Executable after: ${new Date(op.executeAfter).toLocaleString()}`);
        console.log(`   Target: ${op.target}`);
        console.log(`   Function: ${op.type}()`);
        
        // Check if operation is ready for execution
        const now = new Date();
        const executeAfter = new Date(op.executeAfter);
        const isReadyTime = now > executeAfter;
        
        if (isReadyTime) {
            console.log(`   Status: Ready for execution`);
        } else {
            const timeLeft = executeAfter - now;
            console.log(`   Status: Waiting - ${Math.ceil(timeLeft / 1000 / 60)} minutes left`);
        }
    });
    
    rl.close();
}

// Main function
async function main() {
    try {
        // HARDCODED VALUES - modify these as needed
        const action = 'unpause';  // Set to 'pause' or 'unpause'
        const isSchedule = true;   // Set to true for scheduling
        const isExecute = false;   // Set to false when scheduling
        const isList = false;      // Set to false when scheduling
        const operationId = null;  // Not needed for scheduling

        // No need to read from process.argv since we're hardcoding the values
        
        // Get network addresses
        const addresses = await getAddresses();
        const { network, saleAddress, timelockAddress, safeAddress } = addresses;
        
        console.log("\n===== Token Sale Contract Manager =====");
        console.log(`Network: ${network}`);
        console.log(`Sale Contract: ${saleAddress}`);
        console.log(`Timelock: ${timelockAddress}`);
        console.log(`Safe: ${safeAddress}`);
        console.log(`Action: ${action}, Schedule: ${isSchedule}, Execute: ${isExecute}`);
        
        // Load configuration and contracts
        const safeConfig = loadSafeConfig(network);
        const contracts = await getContracts(saleAddress, timelockAddress, SALE_ABI);
        const safeSigners = loadSafeSigners(safeConfig);
        
        // Perform checks
        await checkOwnership(contracts.sale, timelockAddress);
        await checkRoles(contracts.timelock, safeAddress);
        
        // Get current state
        const isPaused = await contracts.sale.paused();
        console.log(`\nCurrent contract state: ${isPaused ? 'PAUSED' : 'ACTIVE'}`);
        
        // Determine what action to take
        if (isList) {
            await listPendingOperations(network);
        } else if (isSchedule) {
            await scheduleOperation(action, contracts, addresses, safeSigners, safeConfig);
        } else if (isExecute) {
            if (!operationId) {
                throw new Error("Operation ID is required for execution. Use --id=<operation_id>");
            }
            await executeOperation(operationId, contracts, addresses, safeSigners, safeConfig);
        } else {
            console.log("\nNo action specified. Using hardcoded values in script.");
            rl.close();
        }
    } catch (error) {
        console.error(`\nError: ${error.message}`);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });