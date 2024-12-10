const { ethers } = require("hardhat");

async function main() {
    const contractAddress = "0x9F34E732BE4184C4B15A697fcdA5a2EFD006612E";
    
    // Get the contract factory
    const TokenSale = await ethers.getContractFactory("TokenSaleWithPyth");
    
    // Connect to the deployed contract
    const sale = TokenSale.attach(contractAddress);
    
    try {
        // Get the ETH price
        const price = await sale.getEthPrice();
        
        // Convert to USD with 6 decimals (USDT precision)
        const priceInUSD = Number(price) / 1e6;
        
        console.log(`Current ETH price: $${priceInUSD.toFixed(2)}`);
    } catch (error) {
        console.error("Error getting price:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });