// scripts/reset-remaining-tokens-through-timelock.js
const hre = require("hardhat");
const path = require('path');
require('dotenv').config();
const { saveOperation } = require('../../utils/timelock-operations-storage');

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
    "function resetRemainingTokens() external",
    "function remainingTokens() external view returns (uint256)",
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
    // Get ethers from hardhat
    const { ethers } = hre;
    
    // Determine network
    const network = hre.network.name;
    console.log(`Running on network: ${network}`);
    console.log("Starting reset remaining tokens process through timelock...");

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
        throw new Error(`Missing environment variables for ${network}:\n` + 
            `${!safeAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_TOKEN_SALE_SAFE" : "UNICHAIN-SEPOLIA-TESTNET_TOKEN_SALE_SAFE") + "\n" : ""}` +
            `${!timelockAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_SALE_TIMELOCK_ADDRESS" : "UNICHAIN-SEPOLIA-TESTNET_SALE_TIMELOCK_ADDRESS") + "\n" : ""}` +
            `${!saleContractAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_SALE_ADDRESS" : "UNICHAIN-SEPOLIA-TESTNET_SALE_ADDRESS") : ""}`
        );
    }

    console.log('Safe Address:', safeAddress);
    console.log('Timelock Address:', timelockAddress);
    console.log('Sale Contract Address:', saleContractAddress);

    // Check if safeConfig has proper structure
    if (!safeConfig || !safeConfig.signers || !Array.isArray(safeConfig.signers)) {
        console.error(`Invalid keys file format. The file should contain a 'signers' array with private keys.`);
        process.exit(1);
    }

    const provider = ethers.provider;
    
    // Create wallet instances from private keys
    const signers = safeConfig.signers.map(key => 
        new ethers.Wallet(key, provider)
    );

    console.log(`Loaded ${signers.length} signers`);
    console.log('Signer addresses:');
    for (let i = 0; i < signers.length; i++) {
        console.log(`Signer ${i + 1}: ${signers[i].address}`);
    }
    
    // Check if we have enough signers
    if (signers.length === 0) {
        console.error("No signers found in the keys file.");
        process.exit(1);
    }

    try {
        // Connect to the sale contract
        const saleContract = new ethers.Contract(saleContractAddress, TOKEN_SALE_ABI, provider);
        
        // Get the current remaining tokens value and MCT token address
        const currentRemainingTokens = await saleContract.remainingTokens();
        const mctTokenAddress = await saleContract.mctToken();
        
        // Connect to the MCT token contract
        const mctContract = new ethers.Contract(mctTokenAddress, ERC20_ABI, provider);
        
        // Get the MCT balance of the sale contract
        const mctBalance = await mctContract.balanceOf(saleContractAddress);
        const mctDecimals = await mctContract.decimals();
        
        // Format the token amounts for display
        const formattedCurrentRemaining = ethers.formatUnits(currentRemainingTokens, mctDecimals);
        const formattedActualBalance = ethers.formatUnits(mctBalance, mctDecimals);
        
        console.log(`\nCurrent remaining tokens: ${formattedCurrentRemaining} MCT`);
        console.log(`Actual contract MCT balance: ${formattedActualBalance} MCT`);
        
        // Check if there's a discrepancy
        if (currentRemainingTokens === mctBalance) {
            console.log('\nNOTE: The remaining tokens value already matches the actual contract balance.');
            console.log('You can still proceed to reset if you want to ensure it syncs properly.');
        } else {
            console.log('\nDiscrepancy detected between remaining tokens and actual balance!');
            console.log(`Difference: ${ethers.formatUnits(mctBalance - currentRemainingTokens, mctDecimals)} MCT`);
            console.log('Resetting will update the contract to use the actual balance value.');
        }

        // Connect to the Safe contract using ethers
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

        // Create the transaction data for resetting remaining tokens
        const resetTokensData = saleContract.interface.encodeFunctionData("resetRemainingTokens", []);

        // Parameters for the timelock operation
        const target = saleContractAddress; // The contract we want to call
        const value = 0; // No ETH being sent
        const data = resetTokensData; // The resetRemainingTokens function call
        const predecessor = ethers.ZeroHash; // No predecessor dependency
        
        // Generate a salt - using a deterministic but unique value
        // This is important as you'll need this salt value to execute the operation later
        const salt = ethers.id(`reset-tokens-${Date.now()}`);
        
        // Check if this operation already exists on the timelock
        const operationId = await timelockContract.hashOperation(target, value, data, predecessor, salt);
        console.log('\nGenerated Operation ID:', operationId);
        
        // Save operation details for future reference
        saveOperation({
          id: operationId,
          target,
          value,
          data: resetTokensData,
          predecessor,
          salt,
          description: `Reset remaining tokens from ${formattedCurrentRemaining} to ${formattedActualBalance} MCT`,
          network,
          timestamp: Date.now()
        });
        
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
                    to: timelockAddress, // Target the timelock contract
                    value: ethers.parseEther("0"),
                    data: executeTxData, // Execute the scheduled operation
                    operation: 0, // Call
                    safeTxGas: ethers.parseEther("0"),
                    baseGas: ethers.parseEther("0"),
                    gasPrice: ethers.parseEther("0"),
                    gasToken: ethers.ZeroAddress,
                    refundReceiver: ethers.ZeroAddress,
                    nonce: nonce
                };
                
                console.log('Collecting signatures for execution...');
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

                console.log('Executing reset remaining tokens through timelock...');
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
                    console.log('Remaining tokens reset successfully through timelock!');
                    console.log('Transaction hash:', receipt.hash);
                    
                    // Check the new remaining tokens value
                    const newRemainingTokens = await saleContract.remainingTokens();
                    const formattedNewRemaining = ethers.formatUnits(newRemainingTokens, mctDecimals);
                    console.log(`New remaining tokens value: ${formattedNewRemaining} MCT`);
                    
                    if (newRemainingTokens === mctBalance) {
                        console.log('Reset was successful! Remaining tokens now match the contract balance.');
                    } else {
                        console.log('Warning: After reset, remaining tokens still don\'t match the contract balance.');
                        console.log(`Contract balance: ${formattedActualBalance} MCT`);
                        console.log(`Remaining tokens: ${formattedNewRemaining} MCT`);
                        console.log('This might indicate other issues with the contract state.');
                    }
                } else {
                    throw new Error('Transaction failed');
                }
            } else if (isPending) {
                console.log('\nOperation is pending and not yet ready for execution.');
                console.log('Please wait until the timelock delay has passed.');
            } else if (isDone) {
                console.log('\nOperation has already been executed.');
                console.log('The remaining tokens should already be reset.');
            }
        } else {
            console.log('\nOperation does not exist yet. Scheduling it on the timelock...');
            
            // Prepare transaction for scheduling through the timelock
            const scheduleTxData = timelockContract.interface.encodeFunctionData("schedule", [
                target, value, data, predecessor, salt, timelockMinDelay
            ]);
            
            // Create the transaction object - targeting the timelock contract
            const safeTx = {
                to: timelockAddress, // Target the timelock contract
                value: ethers.parseEther("0"),
                data: scheduleTxData, // Schedule the operation
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
                console.log(`The operation will be ready for execution after ${timelockMinDelay.toString()} seconds`);
                console.log(`(approximately at ${new Date(Date.now() + Number(timelockMinDelay) * 1000).toLocaleString()})`);
            } else {
                throw new Error('Transaction failed');
            }
        }
        
        console.log('\nIMPORTANT: Operation details have been saved to timelock-operations.json');
        console.log('To execute this operation later:');
        console.log(`npx hardhat run scripts/execute-timelock-operation.js --network ${network}`);
        console.log('Then select this operation from the list.');
        console.log('\nOperation details:');
        console.log('Operation ID:', operationId);
        console.log('Target:', target);
        console.log('Data:', data);
        console.log('Value:', value);
        console.log('Predecessor:', predecessor);
        console.log('Salt:', salt);
        
    } catch (error) {
        console.error("Error during reset remaining tokens through timelock:", error.message);
        if (error.error?.message) {
            console.error("Error details:", error.error.message);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });