const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    // Connect to Sepolia network using your Alchemy RPC
    const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    // Get contract address from env
    const SALE_CONTRACT_ADDRESS = process.env.SALE_CONTRACT_ADDRESS_SEPOLIA;

    console.log("Connected wallet address:", wallet.address);
    console.log("Sale contract address:", SALE_CONTRACT_ADDRESS);

    // Contract ABI - only including the functions we need
    const contractABI = [
        "function unpause() external",
        "function owner() external view returns (address)"
    ];

    // Create contract instance
    const saleContract = new ethers.Contract(SALE_CONTRACT_ADDRESS, contractABI, wallet);

    try {
        // Check if the wallet is the owner
        const contractOwner = await saleContract.owner();
        if (contractOwner.toLowerCase() !== wallet.address.toLowerCase()) {
            throw new Error("The provided wallet is not the contract owner");
        }

        console.log("Unpausing contract...");
        const tx = await saleContract.unpause();
        const receipt = await tx.wait();
        console.log("Contract unpaused successfully! Transaction hash:", receipt.transactionHash);

    } catch (error) {
        console.error("Error during unpause:", error.message);
        if (error.data) {
            console.error("Additional error data:", error.data);
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