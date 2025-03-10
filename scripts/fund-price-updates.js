const hre = require("hardhat");
const { parseEther } = require("viem");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    
    // Contract address from your .env or configuration
    const SALE_CONTRACT_ADDRESS = process.env.SALE_CONTRACT_ADDRESS_SEPOLIA;
    
    // Amount to fund (e.g., 0.1 ETH for price updates)
    const FUND_AMOUNT = parseEther("0.01");
    
    console.log("Funding price updates with deployer account:", deployer.address);

    const TokenSale = await hre.ethers.getContractFactory("TokenSaleWithPyth");
    const tokenSale = TokenSale.attach(SALE_CONTRACT_ADDRESS);

    console.log(`Funding contract with ${hre.ethers.formatEther(FUND_AMOUNT)} ETH...`);
    
    const tx = await tokenSale.fundPriceUpdates({ value: FUND_AMOUNT });
    await tx.wait();
    
    console.log("Successfully funded price updates!");
    
    // Get the current price update balance
    const balance = await tokenSale.priceUpdateBalance();
    console.log(`Current price update balance: ${hre.ethers.formatEther(balance)} ETH`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });