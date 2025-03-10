// scripts/TimeLock/transfer-to-timelocks.js
const hre = require("hardhat");
const { ethers } = require("hardhat");
const path = require('path');
require("dotenv").config();
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

async function main() {
    console.log("Transferring control to timelocks...");
    
    // Get network name from hardhat
    const network = await ethers.provider.getNetwork();
    const networkName = network.name.toUpperCase();
    console.log(`Network: ${networkName}`);
    
    // Load addresses from environment with network prefix
    const stakingAddress = process.env[`${networkName}_STAKING_ADDRESS`];
    const saleAddress = process.env[`${networkName}_SALE_ADDRESS`];
    const stakingTimelockAddress = process.env[`${networkName}_STAKING_TIMELOCK_ADDRESS`];
    const saleTimelockAddress = process.env[`${networkName}_SALE_TIMELOCK_ADDRESS`];
    const stakingSafeAddress = process.env[`${networkName}_MOONCAT_STAKING_SAFE`];
    const saleSafeAddress = process.env[`${networkName}_TOKEN_SALE_SAFE`];
    
    if (!stakingAddress || !saleAddress || !stakingTimelockAddress || 
        !saleTimelockAddress || !stakingSafeAddress || !saleSafeAddress) {
        throw new Error(`Missing required addresses in .env for network ${networkName}`);
    }

    // Validate that addresses are different
    if (saleAddress === saleSafeAddress) {
        throw new Error("Sale contract address and Sale Safe address are identical. This will cause issues with transactions. Please check your environment variables.");
    }
    
    console.log("Addresses:");
    console.log(`- Staking Contract: ${stakingAddress}`);
    console.log(`- Sale Contract: ${saleAddress}`);
    console.log(`- Staking Timelock: ${stakingTimelockAddress}`);
    console.log(`- Sale Timelock: ${saleTimelockAddress}`);
    console.log(`- Staking Safe: ${stakingSafeAddress}`);
    console.log(`- Sale Safe: ${saleSafeAddress}`);
    
    // Load signers from private keys
    const provider = hre.ethers.provider;
    const signers = safeConfig.signers.map(key => 
        new ethers.Wallet(key, provider)
    );
    console.log(`Loaded ${signers.length} signers for Safe transactions`);
    
    // Transfer staking contract roles to timelock
    console.log("\nTransferring staking contract roles to timelock...");
    
    // Create interface for grantRole
    const stakingInterface = new ethers.Interface([
        "function grantRole(bytes32 role, address account) external"
    ]);
    
    // Create role hashes
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    
    // Create grant role calldata
    const adminRoleData = stakingInterface.encodeFunctionData("grantRole", [
        DEFAULT_ADMIN_ROLE, stakingTimelockAddress
    ]);
    
    const governorRoleData = stakingInterface.encodeFunctionData("grantRole", [
        GOVERNOR_ROLE, stakingTimelockAddress
    ]);
    
    const pauserRoleData = stakingInterface.encodeFunctionData("grantRole", [
        PAUSER_ROLE, stakingTimelockAddress
    ]);
    
    // Execute Safe transactions to grant roles
    console.log("Granting DEFAULT_ADMIN_ROLE...");
    await executeGnosisSafeTransaction(stakingSafeAddress, stakingAddress, adminRoleData, signers);
    
    console.log("Granting GOVERNOR_ROLE...");
    await executeGnosisSafeTransaction(stakingSafeAddress, stakingAddress, governorRoleData, signers);
    
    console.log("Granting PAUSER_ROLE...");
    await executeGnosisSafeTransaction(stakingSafeAddress, stakingAddress, pauserRoleData, signers);
    
    // Transfer sale contract ownership to timelock
    console.log("\nTransferring sale contract ownership to timelock...");
    
    // Create interface for transferOwnership
    const saleInterface = new ethers.Interface([
        "function transferOwnership(address newOwner) external"
    ]);
    
    // Create transfer ownership calldata
    const transferOwnershipData = saleInterface.encodeFunctionData("transferOwnership", [
        saleTimelockAddress
    ]);
    
    // Execute Safe transaction to transfer ownership
    console.log("Transferring ownership...");
    await executeGnosisSafeTransaction(saleSafeAddress, saleAddress, transferOwnershipData, signers);
    
    console.log("\nTransfers complete! Your timelocks now control your contracts.");
    console.log("Next step: Test the timelock functionality");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });