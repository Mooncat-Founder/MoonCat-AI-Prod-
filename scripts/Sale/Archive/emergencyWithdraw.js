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
        "function emergencyWithdraw() external",
        "function emergencyMode() external view returns (bool)"
    ];

    // Create contract instance
    const saleContract = new ethers.Contract(SALE_CONTRACT_ADDRESS, contractABI, wallet);

    try {
        // Check if emergency mode is active
        const isEmergencyMode = await saleContract.emergencyMode();
        if (!isEmergencyMode) {
            throw new Error("Emergency mode is not active");
        }

        console.log("Executing emergency withdrawal...");
        const tx = await saleContract.emergencyWithdraw();
        const receipt = await tx.wait();
        console.log("Emergency withdrawal completed successfully! Transaction hash:", receipt.transactionHash);

        // Get the EmergencyWithdraw event from the receipt
        const interface = new ethers.utils.Interface(contractABI);
        const events = receipt.logs.map(log => {
            try {
                return interface.parseLog(log);
            } catch (e) {
                return null;
            }
        }).filter(event => event !== null);

        // Log the amounts withdrawn if we can find them in the event
        for (const event of events) {
            if (event.name === 'EmergencyWithdraw') {
                console.log(`ETH withdrawn: ${ethers.utils.formatEther(event.args.ethAmount)} ETH`);
                console.log(`USDT withdrawn: ${ethers.utils.formatUnits(event.args.usdtAmount, 6)} USDT`);
            }
        }

    } catch (error) {
        console.error("Error during emergency withdrawal:", error.message);
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