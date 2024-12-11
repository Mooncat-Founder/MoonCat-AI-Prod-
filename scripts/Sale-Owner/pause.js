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

async function generateSignature(signer, safeTx, domainSeparator) {
    const SAFE_TX_TYPEHASH = ethersLib.utils.keccak256(
        ethersLib.utils.toUtf8Bytes('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)')
    );

    const encodedData = ethersLib.utils.defaultAbiCoder.encode(
        ['bytes32', 'address', 'uint256', 'bytes32', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
        [
            SAFE_TX_TYPEHASH,
            safeTx.to,
            safeTx.value,
            ethersLib.utils.keccak256(safeTx.data),
            safeTx.operation,
            safeTx.safeTxGas,
            safeTx.baseGas,
            safeTx.gasPrice,
            safeTx.gasToken,
            safeTx.refundReceiver,
            safeTx.nonce
        ]
    );

    const encodedTransactionData = ethersLib.utils.keccak256(encodedData);
    const finalHash = ethersLib.utils.keccak256(
        ethersLib.utils.solidityPack(
            ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
            ['0x19', '0x01', domainSeparator, encodedTransactionData]
        )
    );

    // Sign with ethers v5 signMessage
    const signature = await signer.signMessage(ethersLib.utils.arrayify(finalHash));
    const sig = ethersLib.utils.splitSignature(signature);

    // Convert to Safe signature format
    return {
        signer: signer.address,
        data: ethersLib.utils.hexlify(
            ethersLib.utils.concat([
                sig.r,
                sig.s,
                ethersLib.utils.hexlify(sig.v + 4) // Safe signature type
            ])
        )
    };
}

async function main() {
    console.log("Starting pause process...");

    // Get addresses from environment
    const safeAddress = process.env.TOKEN_SALE;
    const tokenSaleAddress = process.env.SALE_CONTRACT_ADDRESS_SEPOLIA;

    if (!safeAddress || !tokenSaleAddress) {
        throw new Error("Missing TOKEN_SALE or SALE_CONTRACT_ADDRESS_SEPOLIA in .env");
    }

    console.log('Safe Address:', safeAddress);
    console.log('Token Sale Contract Address:', tokenSaleAddress);

    // Get the RPC URL from Hardhat config
    const provider = new ethersLib.providers.JsonRpcProvider(hre.network.config.url);
    
    // Create wallet instances from private keys using ethers library
    const signers = safeConfig.signers.map(key => 
        new ethersLib.Wallet(key, provider)
    );

    console.log(`Loaded ${signers.length} signers`);
    console.log('Signer addresses:');
    for (let i = 0; i < signers.length; i++) {
        console.log(`Signer ${i + 1}: ${signers[i].address}`);
    }

    try {
        // Connect to the Safe contract using ethers
        const safeContract = new ethersLib.Contract(safeAddress, SAFE_ABI, provider);
        
        // Get required Safe data
        const nonce = await safeContract.nonce();
        const threshold = await safeContract.getThreshold();
        const domainSeparator = await safeContract.domainSeparator();
        
        console.log('Current Safe nonce:', nonce.toString());
        console.log('Required threshold:', threshold.toString());

        // Create the transaction data for pausing
        const tokenSaleInterface = new ethersLib.utils.Interface([
            "function pause() external"
        ]);
        const pauseData = tokenSaleInterface.encodeFunctionData("pause", []);

        // Create the transaction object - targeting the token sale contract
        const safeTx = {
            to: tokenSaleAddress, // Target the token sale contract
            value: ethersLib.BigNumber.from(0),
            data: pauseData,
            operation: 0, // Call
            safeTxGas: ethersLib.BigNumber.from(0),
            baseGas: ethersLib.BigNumber.from(0),
            gasPrice: ethersLib.BigNumber.from(0),
            gasToken: ethersLib.constants.AddressZero,
            refundReceiver: ethersLib.constants.AddressZero,
            nonce: nonce
        };

        console.log('Collecting signatures...');
        
        // Collect signatures from owners
        let signatures = [];
        for (let i = 0; i < threshold.toNumber(); i++) {
            console.log(`Getting signature from signer ${i + 1}...`);
            const signature = await generateSignature(signers[i], safeTx, domainSeparator);
            signatures.push(signature);
        }

        // Sort signatures by signer address
        signatures.sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
        const signatureBytes = "0x" + signatures.map(sig => sig.data.slice(2)).join("");

        console.log('Safe transaction details:');
        console.log('To:', safeTx.to);
        console.log('Data:', pauseData);
        console.log('Signature bytes:', signatureBytes);

        console.log('Executing pause transaction...');
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
                maxFeePerGas: ethersLib.utils.parseUnits("20", "gwei"),
                maxPriorityFeePerGas: ethersLib.utils.parseUnits("2", "gwei")
            }
        );

        console.log('Waiting for transaction confirmation...');
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('Contract paused successfully!');
            console.log('Transaction hash:', receipt.transactionHash);
        } else {
            throw new Error('Transaction failed');
        }

    } catch (error) {
        console.error("Error during pause:", error.message);
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