// scripts/finalize-sale-early.js
const hre = require("hardhat");
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

// Determine which keys file to use based on the network
const network = hre.network.name || "unichain-sepolia-testnet";
const keysFile = network.includes("mainnet") ? "keys.prod.json" : "keys.test.json";
let safeConfig;

try {
    safeConfig = require(path.join(process.cwd(), keysFile));
    console.log(`Loaded keys from ${keysFile}`);
} catch (error) {
    console.error(`Error loading keys from ${keysFile}: ${error.message}`);
    console.log(`Make sure ${keysFile} exists in the project root directory.`);
    rl.close();
    process.exit(1);
}

// Extended Safe ABI
const SAFE_ABI = [
    "function nonce() public view returns (uint256)",
    "function getThreshold() public view returns (uint256)",
    "function domainSeparator() public view returns (bytes32)",
    "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes memory signatures) public payable returns (bool success)"
];

// Timelock ABI for the relevant functions
const TIMELOCK_ABI = [
    "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable returns (bytes)",
    "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external",
    "function hashOperation(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external pure returns (bytes32)",
    "function isOperation(bytes32 id) external view returns (bool)",
    "function isOperationPending(bytes32 id) external view returns (bool)",
    "function isOperationReady(bytes32 id) external view returns (bool)",
    "function isOperationDone(bytes32 id) external view returns (bool)",
    "function getTimestamp(bytes32 id) external view returns (uint256)",
    "function getMinDelay() external view returns (uint256)"
];

// Token Sale ABI for contract interaction
const TOKEN_SALE_ABI = [
    "function finalizeSale() external",
    "function saleFinalized() external view returns (bool)",
    "function totalEthRaised() external view returns (uint256)",
    "function totalUsdtRaised() external view returns (uint256)",
    "function usdtToken() external view returns (address)",
    "function mctToken() external view returns (address)"
];

// ERC20 ABI for token balance check
const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
];

async function generateSignature(signer, safeTx, domainSeparator) {
    const { ethers } = hre;
    
    // Create the SAFE_TX_TYPEHASH
    const SAFE_TX_TYPEHASH = ethers.keccak256(
        ethers.toUtf8Bytes('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)')
    );

    // Encode the data according to the Safe's rules
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

    // Calculate the hash to sign
    const encodedTransactionData = ethers.keccak256(encodedData);
    const finalHash = ethers.keccak256(
        ethers.concat([
            ethers.toUtf8Bytes('\x19\x01'),
            domainSeparator,
            encodedTransactionData
        ])
    );

    // Sign with ethers signMessage (v6 style)
    const signature = await signer.signMessage(ethers.getBytes(finalHash));
    const sig = ethers.Signature.from(signature);

    // Convert to Safe signature format
    return {
        signer: signer.address,
        data: ethers.hexlify(
            ethers.concat([
                sig.r,
                sig.s,
                ethers.toBeHex(sig.v + 4) // Safe signature type
            ])
        )
    };
}

async function main() {
    try {
        console.log('=== Finalize Sale Early ===');
        console.log('This script will finalize the token sale early through the timelock.');
        
        // Get ethers from hardhat
        const { ethers } = hre;
        
        // Get addresses from environment based on network
        let safeAddress, timelockAddress, saleContractAddress;
        
        if (network.includes("mainnet")) {
            safeAddress = process.env["UNICHAIN-MAINNET_TOKEN_SALE_SAFE"];
            timelockAddress = process.env["UNICHAIN-MAINNET_SALE_TIMELOCK_ADDRESS"];
            saleContractAddress = process.env["UNICHAIN-MAINNET_SALE_ADDRESS"];
        } else {
            safeAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_TOKEN_SALE_SAFE"];
            timelockAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_SALE_TIMELOCK_ADDRESS"];
            saleContractAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_SALE_ADDRESS"];
        }

        if (!safeAddress || !timelockAddress || !saleContractAddress) {
            throw new Error(`Missing environment variables for ${network}`);
        }

        console.log('Safe Address:', safeAddress);
        console.log('Timelock Address:', timelockAddress);
        console.log('Sale Contract Address:', saleContractAddress);
        
        const provider = ethers.provider;
        
        // Connect to the sale contract
        const saleContract = new ethers.Contract(saleContractAddress, TOKEN_SALE_ABI, provider);
        
        // Check if the sale is already finalized
        const isFinalized = await saleContract.saleFinalized();
        
        if (isFinalized) {
            console.log('\nThe sale is already finalized!');
            rl.close();
            return;
        }
        
        // Get the current sale status
        const totalEthRaised = await saleContract.totalEthRaised();
        const totalUsdtRaised = await saleContract.totalUsdtRaised();
        const usdtTokenAddress = await saleContract.usdtToken();
        const mctTokenAddress = await saleContract.mctToken();
        
        // Connect to the token contracts
        const usdtContract = new ethers.Contract(usdtTokenAddress, ERC20_ABI, provider);
        const mctContract = new ethers.Contract(mctTokenAddress, ERC20_ABI, provider);
        
        // Get token decimals
        const usdtDecimals = await usdtContract.decimals();
        const mctDecimals = await mctContract.decimals();
        
        // Get MCT balance in the contract
        const mctBalance = await mctContract.balanceOf(saleContractAddress);
        
        // Format amounts for display
        const formattedEthRaised = ethers.formatEther(totalEthRaised);
        const formattedUsdtRaised = ethers.formatUnits(totalUsdtRaised, usdtDecimals);
        const formattedMctBalance = ethers.formatUnits(mctBalance, mctDecimals);
        
        console.log('\nCurrent Sale Status:');
        console.log(`Total ETH Raised: ${formattedEthRaised} ETH`);
        console.log(`Total USDT Raised: ${formattedUsdtRaised} USDT`);
        console.log(`Tokens Remaining: ${formattedMctBalance} MCT`);
        
        // Calculate approximate USD value with a placeholder ETH price
        // In a production environment, you would use a price oracle here
        const estimatedEthUsdPrice = 3500; // Replace with actual ETH/USD price
        const estimatedTotalUsdRaised = (
            parseFloat(formattedEthRaised) * estimatedEthUsdPrice + 
            parseFloat(formattedUsdtRaised)
        ).toFixed(2);
        
        console.log(`Estimated Total USD Raised: $${estimatedTotalUsdRaised}`);
        
        // Ask for target raise goal
        const originalRaiseGoal = 2000000; // Original 2M goal
        const targetRaiseGoal = await prompt(`\nEnter your target raise goal in USD (default: 1000000): `);
        
        const raiseGoal = targetRaiseGoal.trim() === '' ? 1000000 : parseFloat(targetRaiseGoal);
        
        if (isNaN(raiseGoal) || raiseGoal <= 0) {
            throw new Error('Invalid raise goal');
        }
        
        console.log(`\nTarget Raise Goal: $${raiseGoal.toLocaleString()}`);
        console.log(`Original Raise Goal: $${originalRaiseGoal.toLocaleString()}`);
        console.log(`Current Raised: $${parseFloat(estimatedTotalUsdRaised).toLocaleString()}`);
        
        // Calculate percentage of target reached
        const percentageOfTargetReached = (parseFloat(estimatedTotalUsdRaised) / raiseGoal * 100).toFixed(2);
        console.log(`Percentage of Target Reached: ${percentageOfTargetReached}%`);
        
        if (parseFloat(estimatedTotalUsdRaised) < raiseGoal) {
            console.log(`\nWARNING: The current amount raised ($${estimatedTotalUsdRaised}) is less than your target goal ($${raiseGoal.toLocaleString()}).`);
            const proceedAnyway = await prompt('Do you want to proceed with finalizing the sale anyway? (y/n): ');
            
            if (proceedAnyway.toLowerCase() !== 'y') {
                console.log('Operation cancelled.');
                rl.close();
                return;
            }
        }
        
        // Final warning and confirmation
        console.log('\n⚠️  WARNING ⚠️');
        console.log('Finalizing the sale will:');
        console.log('1. Stop all new token purchases immediately after the timelock delay');
        console.log('2. Allow users to withdraw their tokens');
        console.log('3. Any tokens remaining in the contract can be withdrawn separately');
        console.log('This action CANNOT be undone.');
        
        const finalConfirmation = await prompt('\nAre you ABSOLUTELY SURE you want to finalize the sale early? (type "FINALIZE" to confirm): ');
        
        if (finalConfirmation !== 'FINALIZE') {
            console.log('Operation cancelled.');
            rl.close();
            return;
        }
        
        // Connect to the Safe contract
        const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
        // Connect to the Timelock contract
        const timelockContract = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
        
        // Get required Safe data
        const nonce = await safeContract.nonce();
        const threshold = await safeContract.getThreshold();
        const domainSeparator = await safeContract.domainSeparator();
        
        console.log('Current Safe nonce:', nonce.toString());
        console.log('Required threshold:', threshold.toString());
        
        // Get the timelock minimum delay
        const timelockMinDelay = await timelockContract.getMinDelay();
        console.log(`Timelock minimum delay: ${timelockMinDelay.toString()} seconds (${Number(timelockMinDelay) / 3600} hours)`);
        
        // Create the transaction data for finalizing the sale
        const finalizeSaleData = saleContract.interface.encodeFunctionData("finalizeSale", []);
        
        // Parameters for the timelock operation
        const target = saleContractAddress;
        const value = 0;
        const data = finalizeSaleData;
        const predecessor = ethers.ZeroHash;
        const salt = ethers.id(`finalize-sale-early-${Date.now()}`);
        
        // Check if this operation already exists on the timelock
        const operationId = await timelockContract.hashOperation(target, value, data, predecessor, salt);
        console.log('\nGenerated Operation ID:', operationId);
        
        const operationExists = await timelockContract.isOperation(operationId);
        
        if (operationExists) {
            const isPending = await timelockContract.isOperationPending(operationId);
            const isReady = await timelockContract.isOperationReady(operationId);
            const isDone = await timelockContract.isOperationDone(operationId);
            const timestamp = await timelockContract.getTimestamp(operationId);
            
            console.log('Operation already exists on the timelock!');
            console.log('Status:', isDone ? 'Executed' : isReady ? 'Ready for execution' : isPending ? 'Pending' : 'Unknown');
            console.log('Scheduled execution time:', new Date(Number(timestamp) * 1000).toLocaleString());
            
            if (isReady) {
                console.log('\nOperation is ready for execution! Preparing to execute...');
                // Prepare transaction for executing through the timelock
                const executeTxData = timelockContract.interface.encodeFunctionData("execute", [
                    target, value, data, predecessor, salt
                ]);
                
                // Create the transaction object - targeting the timelock contract for execution
                const safeTx = {
                    to: timelockAddress,
                    value: ethers.parseEther("0"),
                    data: executeTxData,
                    operation: 0, // Call
                    safeTxGas: ethers.parseEther("0"),
                    baseGas: ethers.parseEther("0"),
                    gasPrice: ethers.parseEther("0"),
                    gasToken: ethers.ZeroAddress,
                    refundReceiver: ethers.ZeroAddress,
                    nonce: nonce
                };
                
                console.log('Collecting signatures for execution...');
                
                // Create wallet instances from private keys
                const signers = safeConfig.signers.map(key => 
                    new ethers.Wallet(key, provider)
                );

                console.log(`Loaded ${signers.length} signers`);
                
                // Collect signatures from owners
                let signatures = [];
                const thresholdValue = typeof threshold.toNumber === 'function' ? threshold.toNumber() : Number(threshold);
                for (let i = 0; i < thresholdValue; i++) {
                    console.log(`Getting signature from signer ${i + 1}...`);
                    const signature = await generateSignature(signers[i], safeTx, domainSeparator);
                    signatures.push(signature);
                }

                // Sort signatures by signer address
                signatures.sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
                const signatureBytes = "0x" + signatures.map(sig => sig.data.slice(2)).join("");

                console.log('Executing finalize sale through timelock...');
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
                    console.log('Sale finalized successfully through timelock!');
                    console.log('Transaction hash:', receipt.hash);
                    
                    // Check if the sale is now finalized
                    const newStatus = await saleContract.saleFinalized();
                    console.log(`Sale finalized status: ${newStatus ? 'YES' : 'NO'}`);
                    
                    if (newStatus) {
                        console.log('\nThe sale has been successfully finalized!');
                        console.log('Users can now withdraw their tokens.');
                    } else {
                        console.log('\nWarning: Transaction succeeded but the sale may not be finalized yet.');
                        console.log('Please check the contract state.');
                    }
                } else {
                    throw new Error('Transaction failed');
                }
            } else if (isPending) {
                console.log('\nOperation is pending and not yet ready for execution.');
                console.log('Please wait until the timelock delay has passed.');
                console.log(`Operation will be ready at approximately: ${new Date(Number(timestamp) * 1000).toLocaleString()}`);
            } else if (isDone) {
                console.log('\nOperation has already been executed.');
                
                // Double-check if the sale is actually finalized
                const checkFinalized = await saleContract.saleFinalized();
                if (checkFinalized) {
                    console.log('The sale is finalized.');
                } else {
                    console.log('Warning: Operation marked as executed, but the sale is not finalized. Please investigate.');
                }
            }
        } else {
            console.log('\nOperation does not exist yet. Scheduling it on the timelock...');
            
            // Prepare transaction for scheduling through the timelock
            const scheduleTxData = timelockContract.interface.encodeFunctionData("schedule", [
                target, value, data, predecessor, salt, timelockMinDelay
            ]);
            
            // Create wallet instances from private keys
            const signers = safeConfig.signers.map(key => 
                new ethers.Wallet(key, provider)
            );

            console.log(`Loaded ${signers.length} signers`);
            
            // Create the transaction object - targeting the timelock contract
            const safeTx = {
                to: timelockAddress,
                value: ethers.parseEther("0"),
                data: scheduleTxData,
                operation: 0, // Call
                safeTxGas: ethers.parseEther("0"),
                baseGas: ethers.parseEther("0"),
                gasPrice: ethers.parseEther("0"),
                gasToken: ethers.ZeroAddress,
                refundReceiver: ethers.ZeroAddress,
                nonce: nonce
            };
            
            console.log('Collecting signatures for scheduling...');
            
            // Collect signatures from owners
            let signatures = [];
            const thresholdValue = typeof threshold.toNumber === 'function' ? threshold.toNumber() : Number(threshold);
            for (let i = 0; i < thresholdValue; i++) {
                console.log(`Getting signature from signer ${i + 1}...`);
                const signature = await generateSignature(signers[i], safeTx, domainSeparator);
                signatures.push(signature);
            }

            // Sort signatures by signer address
            signatures.sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
            const signatureBytes = "0x" + signatures.map(sig => sig.data.slice(2)).join("");

            console.log('Scheduling operation through timelock...');
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
                console.log('Operation scheduled successfully!');
                console.log('Transaction hash:', receipt.hash);
                
                // Calculate the execution time
                const executionTime = new Date(Date.now() + Number(timelockMinDelay) * 1000);
                
                console.log(`\nThe operation will be ready for execution after the timelock delay.`);
                console.log(`Expected execution time: ${executionTime.toLocaleString()}`);
                console.log(`\nOnce the delay has passed, run this script again to execute the finalization.`);
                console.log(`Operation ID: ${operationId}`);
            } else {
                throw new Error('Transaction failed');
            }
        }
    } catch (error) {
        console.error("Error during finalize sale early:", error.message);
        if (error.error?.message) {
            console.error("Error details:", error.error.message);
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