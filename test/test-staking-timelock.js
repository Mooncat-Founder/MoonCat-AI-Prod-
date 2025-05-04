// scripts/TimeLock/test-staking-timelock.js
const hre = require("hardhat");
const { ethers } = require("hardhat");
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
    const SAFE_TX_TYPEHASH = ethers.keccak256(
        ethers.toUtf8Bytes('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)')
    );

    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'address', 'uint256', 'bytes32', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
        [
            SAFE_TX_TYPEHASH,
            safeTx.to,
            safeTx.value,
            ethers.keccak256(safeTx.data),
            safeTx.operation,
            safeTx.safeTxGas,
            safeTx.baseGas,
            safeTx.gasPrice,
            safeTx.gasToken,
            safeTx.refundReceiver,
            safeTx.nonce
        ]
    );

    const encodedTransactionData = ethers.keccak256(encodedData);
    const finalHash = ethers.keccak256(
        ethers.concat([
            '0x1901',
            domainSeparator,
            encodedTransactionData
        ])
    );

    const signature = await signer.signMessage(ethers.getBytes(finalHash));
    const sig = ethers.Signature.from(signature);

    return {
        signer: signer.address,
        data: ethers.hexlify(
            ethers.concat([
                sig.r,
                sig.s,
                ethers.toBeHex(sig.v + 4, 1)
            ])
        )
    };
}

async function executeGnosisSafeTransaction(safeAddress, targetAddress, calldata, signers, forcedNonce = null) {
    console.log(`Executing transaction through Safe ${safeAddress} to target ${targetAddress}`);
    console.log(`Calldata: ${calldata.slice(0, 66)}...`);
    
    // Get network info first to confirm we're on the right network
    const provider = ethers.provider;
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
    console.log(`Safe balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
        throw new Error(`Safe has no ETH for gas. Please send ETH to ${safeAddress}`);
    }
    
    // Create contract instance
    const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    
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
        threshold = BigInt(safeConfig.threshold || 2);
        
        // Calculate domain separator manually
        const chainId = network.chainId;
        domainSeparator = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address'],
                [
                    ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(address verifyingContract)')),
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
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
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
                maxFeePerGas: ethers.parseUnits("20", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
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
            console.log("Transaction was already submitted and is pending. Waiting for confirmation...");
            
            // Wait for the transaction to be mined
            // This is a simplification - in production, you'd want to track the tx more robustly
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
        const timelockInterface = new ethers.Interface([
            "function isOperationPending(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)"
        ]);
        
        const timelockContract = new ethers.Contract(timelockAddress, timelockInterface, ethers.provider);
        
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
        const timelockInterface = new ethers.Interface([
            "function isOperationReady(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external view returns (bool)"
        ]);
        
        const timelockContract = new ethers.Contract(timelockAddress, timelockInterface, ethers.provider);
        
        // Check if operation is ready
        const isReady = await timelockContract.isOperationReady(target, value, data, predecessor, salt);
        return isReady;
    } catch (error) {
        console.log(`Error checking if operation is ready: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log("Starting staking timelock test...");
    
    // Get network name from hardhat
    const network = await ethers.provider.getNetwork();
    const networkName = network.name.toUpperCase();
    console.log(`Network: ${networkName}`);
    
    // Use network-prefixed environment variables
    const stakingAddress = process.env[`${networkName}_STAKING_ADDRESS`];
    const timelockAddress = process.env[`${networkName}_STAKING_TIMELOCK_ADDRESS`];
    const safeAddress = process.env[`${networkName}_MOONCAT_STAKING_SAFE`];
    
    if (!stakingAddress || !timelockAddress || !safeAddress) {
        throw new Error(`Missing addresses in .env for network ${networkName}`);
    }
    
    console.log('Staking Contract Address:', stakingAddress);
    console.log('Timelock Address:', timelockAddress);
    console.log('Safe Address:', safeAddress);
    
    // Load Safe signers from config
    const safeSigners = safeConfig.signers.map(key => 
        new ethers.Wallet(key, ethers.provider)
    );
    
    console.log(`Loaded ${safeSigners.length} Safe signers`);
    
    // Timelock ABI for getting the delay
    const timelockABI = [
        "function getMinDelay() external view returns (uint256)",
        "function hasRole(bytes32 role, address account) external view returns (bool)",
        "function PROPOSER_ROLE() external view returns (bytes32)",
        "function EXECUTOR_ROLE() external view returns (bytes32)"
    ];
    
    // Staking contract ABI for functions and role checks
    const stakingABI = [
        "function hasRole(bytes32 role, address account) external view returns (bool)",
        "function rewardRate7Days() external view returns (uint256)",
        "function rewardRate1Year() external view returns (uint256)",
        "function setRewardRate7Days(uint256 _newRate) external",
        "function setRewardRate1Year(uint256 _newRate) external"
    ];
    
    // Create contract instances
    const stakingContract = new ethers.Contract(stakingAddress, stakingABI, ethers.provider);
    const timelockContract = new ethers.Contract(timelockAddress, timelockABI, ethers.provider);
    
    // Verify timelock has the required roles
    console.log("\nChecking if timelock has required roles on staking contract...");
    
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    
    const hasAdminRole = await stakingContract.hasRole(DEFAULT_ADMIN_ROLE, timelockAddress);
    const hasGovernorRole = await stakingContract.hasRole(GOVERNOR_ROLE, timelockAddress);
    const hasPauserRole = await stakingContract.hasRole(PAUSER_ROLE, timelockAddress);
    
    console.log(`Timelock has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);
    console.log(`Timelock has GOVERNOR_ROLE: ${hasGovernorRole}`);
    console.log(`Timelock has PAUSER_ROLE: ${hasPauserRole}`);
    
    if (!hasAdminRole || !hasGovernorRole || !hasPauserRole) {
        console.error("Timelock is missing required roles! Please grant roles first.");
        return;
    }
    
    // Get current reward rates
    const current7DayRate = await stakingContract.rewardRate7Days();
    const current1YearRate = await stakingContract.rewardRate1Year();
    console.log(`\nCurrent 7-day reward rate: ${current7DayRate} basis points (${Number(current7DayRate)/100}%)`);
    console.log(`Current 1-year reward rate: ${current1YearRate} basis points (${Number(current1YearRate)/100}%)`);
    
    // Set new rates explicitly
    const new7DayRate = 1999;  // 19.99%
    const new1YearRate = 3500; // 35.00%
    console.log(`Setting 7-day rate to: ${new7DayRate} basis points (${new7DayRate/100}%)`);
    console.log(`Setting 1-year rate to: ${new1YearRate} basis points (${new1YearRate/100}%)`);
    
    // Get minimum delay from timelock
    const delay = await timelockContract.getMinDelay();
    console.log(`Timelock minimum delay: ${ethers.formatUnits(delay, 0)} seconds (${Number(delay) / 3600} hours)`);
    
    // Create a unique salt for each operation
    const timestamp = Math.floor(Date.now() / 1000);
    const salt7Day = ethers.keccak256(ethers.toUtf8Bytes(`7day-rate-change-${timestamp}`));
    const salt1Year = ethers.keccak256(ethers.toUtf8Bytes(`1year-rate-change-${timestamp}`));
    
    try {
        console.log("\n==== UPDATING 7-DAY RATE ====");
        console.log("\nStep 1: Scheduling 7-day rate change through Safe to timelock...");
        
        // Check if Safe has the proposer role on the timelock
        const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
        const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, safeAddress);
        console.log(`Safe has PROPOSER_ROLE: ${hasProposerRole}`);
        
        if (!hasProposerRole) {
            console.error("Safe doesn't have proposer role on timelock. Check your configuration.");
            return;
        }
        
        // Create calldata for 7-day rate change
        const stakingInterface7Day = new ethers.Interface([
            "function setRewardRate7Days(uint256 _newRate) external"
        ]);
        const setRate7DayData = stakingInterface7Day.encodeFunctionData("setRewardRate7Days", [new7DayRate]);
        
        // Create timelock interface for the schedule function
        const timelockInterface = new ethers.Interface([
            "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external"
        ]);
        
        const scheduleData7Day = timelockInterface.encodeFunctionData("schedule", [
            stakingAddress,
            0,
            setRate7DayData,
            ethers.ZeroHash,
            salt7Day,
            delay
        ]);
        
        // Use Gnosis Safe to schedule the 7-day rate change operation
        await executeGnosisSafeTransaction(safeAddress, timelockAddress, scheduleData7Day, safeSigners);
        console.log("7-day rate change scheduled successfully!");
        
        // Verify the operation was scheduled successfully
        const isPending7Day = await isOperationPending(timelockAddress, stakingAddress, 0, setRate7DayData, ethers.ZeroHash, salt7Day);
        console.log(`7-day rate change is pending: ${isPending7Day}`);
        
        if (!isPending7Day) {
            console.log("7-day rate change does not appear to be pending. It might have failed or already been executed.");
        }
        
        console.log("\n==== UPDATING 1-YEAR RATE ====");
        console.log("\nStep 1: Scheduling 1-year rate change through Safe to timelock...");
        
        // Create calldata for 1-year rate change
        const stakingInterface1Year = new ethers.Interface([
            "function setRewardRate1Year(uint256 _newRate) external"
        ]);
        const setRate1YearData = stakingInterface1Year.encodeFunctionData("setRewardRate1Year", [new1YearRate]);
        
        const scheduleData1Year = timelockInterface.encodeFunctionData("schedule", [
            stakingAddress,
            0,
            setRate1YearData,
            ethers.ZeroHash,
            salt1Year,
            delay
        ]);
        
        // Use Gnosis Safe to schedule the 1-year rate change operation
        await executeGnosisSafeTransaction(safeAddress, timelockAddress, scheduleData1Year, safeSigners);
        console.log("1-year rate change scheduled successfully!");
        
        // Verify the operation was scheduled successfully
        const isPending1Year = await isOperationPending(timelockAddress, stakingAddress, 0, setRate1YearData, ethers.ZeroHash, salt1Year);
        console.log(`1-year rate change is pending: ${isPending1Year}`);
        
        if (!isPending1Year) {
            console.log("1-year rate change does not appear to be pending. It might have failed or already been executed.");
        }
        
        const executeAfter = timestamp + Number(delay);
        console.log(`\nBoth operations can be executed after: ${new Date(executeAfter * 1000).toLocaleString()}`);
        const waitTime = executeAfter - Math.floor(Date.now() / 1000);
        console.log(`Need to wait approximately ${waitTime} seconds (${waitTime/3600} hours)`);
        
        if (waitTime > 0) {
            console.log(`\nWaiting for ${waitTime} seconds before execution...`);
            console.log("(Press Ctrl+C to exit if you want to run the execution part later)");
            
            await sleep(waitTime * 1000 + 5000); // Add 5 seconds buffer
        }
        
        console.log("\n==== EXECUTING 7-DAY RATE CHANGE ====");
        console.log("\nStep 2: Executing the scheduled 7-day rate change through Safe to timelock...");
        
        // Check if Safe has the executor role on the timelock
        const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();
        const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, safeAddress);
        console.log(`Safe has EXECUTOR_ROLE: ${hasExecutorRole}`);
        
        if (!hasExecutorRole) {
            console.error("Safe doesn't have executor role on timelock. Check your configuration.");
            return;
        }
        
        // Check if the 7-day rate change operation is ready to be executed
        const isReady7Day = await isOperationReady(timelockAddress, stakingAddress, 0, setRate7DayData, ethers.ZeroHash, salt7Day);
        console.log(`7-day rate change is ready for execution: ${isReady7Day}`);
        
        if (!isReady7Day) {
            console.log("7-day rate change is not ready yet. Waiting a bit longer...");
            await sleep(60000); // Wait an additional minute
        }
        
        // Create timelock interface for the execute function
        const executeInterface = new ethers.Interface([
            "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable"
        ]);
        
        const executeData7Day = executeInterface.encodeFunctionData("execute", [
            stakingAddress,
            0,
            setRate7DayData,
            ethers.ZeroHash,
            salt7Day
        ]);
        
        // Use Gnosis Safe to execute the 7-day rate change operation
        await executeGnosisSafeTransaction(safeAddress, timelockAddress, executeData7Day, safeSigners);
        console.log("7-day rate change executed successfully!");
        
        console.log("\n==== EXECUTING 1-YEAR RATE CHANGE ====");
        console.log("\nStep 2: Executing the scheduled 1-year rate change through Safe to timelock...");
        
        // Check if the 1-year rate change operation is ready to be executed
        const isReady1Year = await isOperationReady(timelockAddress, stakingAddress, 0, setRate1YearData, ethers.ZeroHash, salt1Year);
        console.log(`1-year rate change is ready for execution: ${isReady1Year}`);
        
        if (!isReady1Year) {
            console.log("1-year rate change is not ready yet. Waiting a bit longer...");
            await sleep(60000); // Wait an additional minute
        }
        
        const executeData1Year = executeInterface.encodeFunctionData("execute", [
            stakingAddress,
            0,
            setRate1YearData,
            ethers.ZeroHash,
            salt1Year
        ]);
        
        // Use Gnosis Safe to execute the 1-year rate change operation
        await executeGnosisSafeTransaction(safeAddress, timelockAddress, executeData1Year, safeSigners);
        console.log("1-year rate change executed successfully!");
        
        // Add delay to allow blockchain to update
        await sleep(10000);
        
        // Verify the new rates
        const updated7DayRate = await stakingContract.rewardRate7Days();
        const updated1YearRate = await stakingContract.rewardRate1Year();
        console.log(`\nVerifying 7-day rate - expected: ${new7DayRate}, actual: ${updated7DayRate}`);
        console.log(`Verifying 1-year rate - expected: ${new1YearRate}, actual: ${updated1YearRate}`);
        
        if (Number(updated7DayRate) === new7DayRate && Number(updated1YearRate) === new1YearRate) {
            console.log("✅ Both rates were successfully updated through the timelock!");
        } else {
            if (Number(updated7DayRate) !== new7DayRate) {
                console.log("❌ 7-day rate was not updated correctly. Please check the transaction details.");
            }
            if (Number(updated1YearRate) !== new1YearRate) {
                console.log("❌ 1-year rate was not updated correctly. Please check the transaction details.");
            }
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