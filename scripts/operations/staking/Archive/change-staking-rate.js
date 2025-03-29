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

async function main() {
    console.log("Starting rate change process...");

    const safeAddress = process.env.MOONCAT_STAKING_SAFE;
    const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS_SEPOLIA;

    if (!safeAddress || !stakingAddress) {
        throw new Error("Missing MOONCAT_STAKING_SAFE or STAKING_CONTRACT_ADDRESS_SEPOLIA in .env");
    }

    console.log('Safe Address:', safeAddress);
    console.log('Staking Contract Address:', stakingAddress);

    // Use hardhat's provider
    const provider = hre.ethers.provider;
    
    const signers = safeConfig.signers.map(key => 
        new ethersLib.Wallet(key, provider)
    );

    console.log(`Loaded ${signers.length} signers`);

    try {
        const safeContract = new ethersLib.Contract(safeAddress, SAFE_ABI, provider);
        
        const nonce = await safeContract.nonce();
        const threshold = await safeContract.getThreshold();
        const domainSeparator = await safeContract.domainSeparator();
        
        console.log('Current Safe nonce:', nonce.toString());
        console.log('Required threshold:', threshold.toString());

        // Create the transaction data for setting max rate
        const stakingInterface = new ethersLib.Interface([
            "function setRewardRate1Year(uint256 _newRate) external"
        ]);
        
        // Set to max rate (9900 = 99%)
        const setRateData = stakingInterface.encodeFunctionData("setRewardRate1Year", [9900]);

        const safeTx = {
            to: stakingAddress,
            value: 0n,
            data: setRateData,
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

        console.log('Executing rate change transaction...');
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
            console.log('Rate changed successfully!');
            console.log('Transaction hash:', receipt.transactionHash);
        } else {
            throw new Error('Transaction failed');
        }

    } catch (error) {
        console.error("Error during rate change:", error.message);
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