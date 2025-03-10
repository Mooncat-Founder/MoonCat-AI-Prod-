// scripts/TimeLock/test-sale-timelock.js
const hre = require("hardhat");
const ethersLib = require("ethers");
const path = require('path');
require('dotenv').config();
const safeConfig = require(path.join(process.cwd(), 'multisig_keys.json'));

// Extended Safe ABI
const SAFE_ABI = [
    "function nonce() public view returns (uint256)",
    "function getThreshold() public view returns (uint256)",
    "function domainSeparator() public view returns (bytes32)",
    "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes memory signatures) public payable returns (bool success)"
];

// Helper function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function executeGnosisSafeTransaction(safeAddress, targetAddress, calldata, signers, forcedNonce = null) {
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
    console.log(`Contract bytecode length: ${(code.length - 2) / 2} bytes`);
    
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
        threshold = BigInt(safeConfig.safeConfig.threshold);
        
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
        
        // Use direct contract call like in the working script
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

// Helper function to check if a timelock operation is pending
async function isOperationPending(timelockAddress, target, value, data, predecessor, salt) {
    try {
        // Create timelock interface with isOperationPending function
        const timelockInterface = new ethersLib.Interface([
            "function isOperationPending(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)"
        ]);
        
        const timelockContract = new ethersLib.Contract(timelockAddress, timelockInterface, hre.ethers.provider);
        
        // Check if operation is pending
        const isPending = await timelockContract.isOperationPending(target, value, data, predecessor, salt);
        return isPending;
    } catch (error) {
        console.log(`Error checking if operation is pending: ${error.message}`);
        return false;
    }
}

// Helper function to check if a timelock operation is ready for execution
async function isOperationReady(timelockAddress, target, value, data, predecessor, salt) {
    try {
        // Create timelock interface with isOperationReady function
        const timelockInterface = new ethersLib.Interface([
            "function isOperationReady(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)"
        ]);
        
        const timelockContract = new ethersLib.Contract(timelockAddress, timelockInterface, hre.ethers.provider);
        
        // Check if operation is ready
        const isReady = await timelockContract.isOperationReady(target, value, data, predecessor, salt);
        return isReady;
    } catch (error) {
        console.log(`Error checking if operation is ready: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log("Starting sale timelock test...");
    
    // Get network name from hardhat
    const network = await hre.ethers.provider.getNetwork();
    const networkName = network.name.toUpperCase();
    console.log(`Network: ${networkName}`);
    
    // Use network-prefixed environment variables
    const saleAddress = process.env[`${networkName}_SALE_ADDRESS`];
    const timelockAddress = process.env[`${networkName}_SALE_TIMELOCK_ADDRESS`];
    const safeAddress = process.env[`${networkName}_TOKEN_SALE_SAFE`];
    
    if (!saleAddress || !timelockAddress || !safeAddress) {
        throw new Error(`Missing addresses in .env for network ${networkName}`);
    }
    
    console.log('Sale Contract Address:', saleAddress);
    console.log('Timelock Address:', timelockAddress);
    console.log('Safe Address:', safeAddress);
    
    // Use hardhat's provider
    const provider = hre.ethers.provider;
    
    // Load Safe signers from config
    const safeSigners = safeConfig.signers.map(key => 
        new ethersLib.Wallet(key, provider)
    );
    
    console.log(`Loaded ${safeSigners.length} Safe signers`);
    
    // Timelock ABI for getting the delay
    const timelockABI = [
        "function getMinDelay() external view returns (uint256)",
        "function hasRole(bytes32 role, address account) external view returns (bool)",
        "function PROPOSER_ROLE() external view returns (bytes32)",
        "function EXECUTOR_ROLE() external view returns (bytes32)"
    ];
    
    // Sale contract ABI for functions and owner checks
    const saleABI = [
        "function owner() external view returns (address)",
        "function paused() external view returns (bool)"
    ];
    
    // Create contract instances
    const saleContract = new ethersLib.Contract(saleAddress, saleABI, provider);
    const timelockContract = new ethersLib.Contract(timelockAddress, timelockABI, provider);
    
    // Verify timelock is the owner of the sale contract
    console.log("\nChecking if timelock is the owner of the sale contract...");
    
    const owner = await saleContract.owner();
    const isOwner = owner.toLowerCase() === timelockAddress.toLowerCase();
    
    console.log(`Sale contract owner: ${owner}`);
    console.log(`Timelock is owner: ${isOwner}`);
    
    if (!isOwner) {
        console.error("Timelock is not the owner of the sale contract! Please transfer ownership first.");
        return;
    }
    
    // Get current pause state
    const isPaused = await saleContract.paused();
    console.log(`\nCurrent paused state: ${isPaused}`);
    
    // We'll toggle the pause state - if it's paused, we'll unpause, and vice versa
    const functionToCall = isPaused ? "unpause" : "pause";
    console.log(`We will ${functionToCall} the contract through the timelock`);
    
    // Create calldata for toggling pause
    const saleInterface = new ethersLib.Interface([
        "function pause() external",
        "function unpause() external"
    ]);
    const togglePauseData = saleInterface.encodeFunctionData(functionToCall, []);
    
    // Get minimum delay from timelock
    const delay = await timelockContract.getMinDelay();
    console.log(`Timelock minimum delay: ${ethersLib.formatUnits(delay, 0)} seconds (${Number(delay) / 3600} hours)`);
    
    // Create a unique salt for this operation
    const timestamp = Math.floor(Date.now() / 1000);
    const salt = ethersLib.keccak256(ethersLib.toUtf8Bytes(`toggle-pause-${timestamp}`));
    
    try {
        console.log(`\nStep 1: Scheduling ${functionToCall} operation through Safe to timelock...`);
        
        // Check if Safe has the proposer role on the timelock
        const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
        const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, safeAddress);
        console.log(`Safe has PROPOSER_ROLE: ${hasProposerRole}`);
        
        if (!hasProposerRole) {
            console.error("Safe doesn't have proposer role on timelock. Check your configuration.");
            return;
        }
        
        // Create timelock interface for the schedule function
        const timelockInterface = new ethersLib.Interface([
            "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external"
        ]);
        
        const scheduleData = timelockInterface.encodeFunctionData("schedule", [
            saleAddress,
            0,
            togglePauseData,
            ethersLib.ZeroHash,
            salt,
            delay
        ]);
        
        // Use Gnosis Safe to schedule the operation
        await executeGnosisSafeTransaction(safeAddress, timelockAddress, scheduleData, safeSigners);
        console.log(`${functionToCall} operation scheduled successfully!`);
        
        // Verify the operation was scheduled successfully
        const isPending = await isOperationPending(timelockAddress, saleAddress, 0, togglePauseData, ethersLib.ZeroHash, salt);
        console.log(`Operation is pending: ${isPending}`);
        
        if (!isPending) {
            console.log("Operation does not appear to be pending. It might have failed or already been executed.");
            // We'll continue anyway, in case our check is wrong
        }
        
        const executeAfter = timestamp + Number(delay);
        console.log(`Can be executed after: ${new Date(executeAfter * 1000).toLocaleString()}`);
        const waitTime = executeAfter - Math.floor(Date.now() / 1000);
        console.log(`Need to wait approximately ${waitTime} seconds`);
        
        if (waitTime > 0) {
            console.log(`\nWaiting for ${waitTime} seconds before execution...`);
            console.log("(Press Ctrl+C to exit if you want to run the execution part later)");
            
            await sleep(waitTime * 1000 + 5000); // Add 5 seconds buffer
        }
        
        console.log("\nStep 2: Executing the scheduled operation through Safe to timelock...");
        
        // Check if Safe has the executor role on the timelock
        const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();
        const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, safeAddress);
        console.log(`Safe has EXECUTOR_ROLE: ${hasExecutorRole}`);
        
        if (!hasExecutorRole) {
            console.error("Safe doesn't have executor role on timelock. Check your configuration.");
            return;
        }
        
        // Check if the operation is ready to be executed
        const isReady = await isOperationReady(timelockAddress, saleAddress, 0, togglePauseData, ethersLib.ZeroHash, salt);
        console.log(`Operation is ready for execution: ${isReady}`);
        
        if (!isReady) {
            console.log("Operation is not ready yet. Waiting a bit longer...");
            await sleep(60000); // Wait an additional minute
        }
        
        // Create timelock interface for the execute function
        const executeInterface = new ethersLib.Interface([
            "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable"
        ]);
        
        const executeData = executeInterface.encodeFunctionData("execute", [
            saleAddress,
            0,
            togglePauseData,
            ethersLib.ZeroHash,
            salt
        ]);
        
        // Use Gnosis Safe to execute the operation
        await executeGnosisSafeTransaction(safeAddress, timelockAddress, executeData, safeSigners);
        console.log(`${functionToCall} operation executed successfully!`);
        
        // Add delay to allow blockchain to update
        await sleep(10000);
        
        // Verify the new paused state
        const newPausedState = await saleContract.paused();
        console.log(`\nVerifying new paused state - expected: ${!isPaused}, actual: ${newPausedState}`);
        
        if (newPausedState === !isPaused) {
            console.log(`✅ Contract ${isPaused ? 'unpaused' : 'paused'} successfully through the timelock!`);
        } else {
            console.log(`❌ Paused state was not toggled correctly. Please check the transaction details.`);
        }
    } catch (error) {
        console.error("Error during test:", error.message);
        if (error.error) {
            console.error("Error details:", error.error);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });