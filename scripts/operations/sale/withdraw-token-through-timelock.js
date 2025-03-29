// scripts/withdraw-token-through-timelock.js
const hre = require("hardhat");
const path = require('path');
const readline = require('readline');
require('dotenv').config();
const { saveOperation } = require('../../utils/timelock-operations-storage');

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

// Token Sale ABI
const TOKEN_SALE_ABI = [
    "function withdrawToken(address token) external",
    "function mctToken() external view returns (address)",
    "function treasuryWallet() external view returns (address)"
];

// ERC20 ABI for token balance check
const ERC20_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function name() external view returns (string)"
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
    console.log("Starting withdraw token process through timelock...");

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
        rl.close();
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
        rl.close();
        process.exit(1);
    }

    try {
        // Connect to the sale contract
        const saleContract = new ethers.Contract(saleContractAddress, TOKEN_SALE_ABI, provider);
        
        // Get the MCT token address (to check it's not the one being withdrawn) and treasury wallet
        const mctTokenAddress = await saleContract.mctToken();
        const treasuryWallet = await saleContract.treasuryWallet();
        
        console.log(`MCT Token Address: ${mctTokenAddress}`);
        console.log(`Treasury Wallet: ${treasuryWallet}`);

        // Get the token address to withdraw
        let tokenAddress = '';
        
        // Check if provided as a command line argument
        const args = process.argv.slice(2);
        const tokenArgIndex = args.findIndex(arg => arg === '--token');
        
        if (tokenArgIndex !== -1 && tokenArgIndex + 1 < args.length) {
            tokenAddress = args[tokenArgIndex + 1];
            console.log(`Using provided token address: ${tokenAddress}`);
        } else {
            // Prompt the user for the token address
            tokenAddress = await prompt('Enter the token address to withdraw: ');
        }
        
        // Validate the token address
        if (!ethers.isAddress(tokenAddress)) {
            throw new Error(`Invalid token address: ${tokenAddress}`);
        }
        
        // Check that it's not the MCT token
        if (tokenAddress.toLowerCase() === mctTokenAddress.toLowerCase()) {
            console.error("Cannot withdraw the MCT token using this function. This is for safety to prevent accidental withdrawal of sale tokens.");
            rl.close();
            process.exit(1);
        }
        
        // Connect to the token contract
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        
        // Try to get token info and balance
        let tokenSymbol, tokenName, tokenDecimals, tokenBalance, formattedBalance;
        try {
            tokenSymbol = await tokenContract.symbol();
            tokenName = await tokenContract.name();
            tokenDecimals = await tokenContract.decimals();
            tokenBalance = await tokenContract.balanceOf(saleContractAddress);
            formattedBalance = ethers.formatUnits(tokenBalance, tokenDecimals);
            
            console.log(`\nToken Information:`);
            console.log(`Name: ${tokenName}`);
            console.log(`Symbol: ${tokenSymbol}`);
            console.log(`Decimals: ${tokenDecimals}`);
            console.log(`Balance in contract: ${formattedBalance} ${tokenSymbol}`);
        } catch (error) {
            console.error(`Error getting token information: ${error.message}`);
            console.log('This might not be a standard ERC20 token or there might be connection issues.');
            const proceedAnyway = await prompt('Do you want to proceed anyway? (y/n): ');
            if (proceedAnyway.toLowerCase() !== 'y') {
                console.log('Operation cancelled.');
                rl.close();
                process.exit(0);
            }
            
            // For non-standard tokens or connection issues, try to get just the balance
            try {
                tokenBalance = await tokenContract.balanceOf(saleContractAddress);
                console.log(`Token balance in contract: ${tokenBalance.toString()}`);
            } catch (error) {
                console.error(`Error getting token balance: ${error.message}`);
                console.log('Could not verify balance. Proceeding without balance information.');
            }
        }
        
        // If we have balance information and it's zero, warn the user
        if (tokenBalance !== undefined && tokenBalance === 0n) {
            console.log('WARNING: The contract has no balance of this token to withdraw.');
            const proceedZeroBalance = await prompt('Do you want to proceed anyway? (y/n): ');
            if (proceedZeroBalance.toLowerCase() !== 'y') {
                console.log('Operation cancelled.');
                rl.close();
                process.exit(0);
            }
        }
        
        // Final confirmation
        const confirm = await prompt(`Do you want to withdraw ${formattedBalance ? `${formattedBalance} ${tokenSymbol}` : 'this token'} to the treasury wallet (${treasuryWallet})? (y/n): `);
        if (confirm.toLowerCase() !== 'y') {
            console.log('Operation cancelled.');
            rl.close();
            process.exit(0);
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

        // Create the transaction data for withdrawing token
        const withdrawTokenData = saleContract.interface.encodeFunctionData("withdrawToken", [tokenAddress]);

        // Parameters for the timelock operation
        const target = saleContractAddress; // The contract we want to call
        const value = 0; // No ETH being sent
        const data = withdrawTokenData; // The withdrawToken function call
        const predecessor = ethers.ZeroHash; // No predecessor dependency
        
        // Generate a salt - using a deterministic but unique value
        // This is important as you'll need this salt value to execute the operation later
        const salt = ethers.id(`withdraw-token-${tokenAddress}-${Date.now()}`);
        
        // Check if this operation already exists on the timelock
        const operationId = await timelockContract.hashOperation(target, value, data, predecessor, salt);
        console.log('\nGenerated Operation ID:', operationId);
        
        // Save operation details for future reference
        saveOperation({
          id: operationId,
          target,
          value,
          data: withdrawTokenData,
          predecessor,
          salt,
          description: `Withdraw ${formattedBalance ? `${formattedBalance} ${tokenSymbol}` : tokenAddress} to treasury (${treasuryWallet})`,
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

                console.log('Executing token withdrawal through timelock...');
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
                    console.log('Token withdrawn successfully through timelock!');
                    console.log('Transaction hash:', receipt.hash);
                    
                    // Check the new balance if we could get the balance initially
                    if (tokenBalance !== undefined) {
                        try {
                            const newBalance = await tokenContract.balanceOf(saleContractAddress);
                            const formattedNewBalance = ethers.formatUnits(newBalance, tokenDecimals);
                            console.log(`New contract token balance: ${formattedNewBalance} ${tokenSymbol}`);
                        } catch (error) {
                            console.error(`Error checking new balance: ${error.message}`);
                        }
                    }
                } else {
                    throw new Error('Transaction failed');
                }
            } else if (isPending) {
                console.log('\nOperation is pending and not yet ready for execution.');
                console.log('Please wait until the timelock delay has passed.');
            } else if (isDone) {
                console.log('\nOperation has already been executed.');
                console.log('The token should already be withdrawn.');
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
        console.error("Error during token withdrawal through timelock:", error.message);
        if (error.error?.message) {
            console.error("Error details:", error.error.message);
        }
        process.exit(1);
    } finally {
        // Close the readline interface
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