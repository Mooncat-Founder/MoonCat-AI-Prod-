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
        "function withdrawETH() external",
        "function withdrawUSDT() external",
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

        console.log("Starting withdrawals...");

        // Get ETH balance of contract before withdrawal
        const ethBalance = await provider.getBalance(SALE_CONTRACT_ADDRESS);
        console.log("Contract ETH balance:", ethers.utils.formatEther(ethBalance), "ETH");

        // Only proceed with ETH withdrawal if there's a balance
        if (!ethBalance.isZero()) {
            console.log("Withdrawing ETH...");
            const ethTx = await saleContract.withdrawETH();
            const ethReceipt = await ethTx.wait();
            console.log("ETH withdrawal successful! Transaction hash:", ethReceipt.transactionHash);
        } else {
            console.log("No ETH to withdraw");
        }

        // Withdraw USDT
        console.log("Attempting USDT withdrawal...");
        const usdtTx = await saleContract.withdrawUSDT();
        const usdtReceipt = await usdtTx.wait();
        console.log("USDT withdrawal successful! Transaction hash:", usdtReceipt.transactionHash);

        console.log("All withdrawals completed successfully!");

    } catch (error) {
        console.error("Error during withdrawal:", error.message);
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