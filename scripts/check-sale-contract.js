//check-sale-contract.js
const { ethers } = require("hardhat");

async function main() {
    const contractAddress = "0x785695aA023E5EecF1bF1A4F311048A34eb6acB1";
    
    // Get the contract factory
    const TokenSale = await ethers.getContractFactory("TokenSaleWithPyth");
    
    // Connect to the deployed contract
    const sale = TokenSale.attach(contractAddress);
    
    try {
        // Get ETH price
        const price = await sale.getEthPrice();
        console.log(`Current ETH price: $${Number(price) / 1e6}`);

        // Get treasury wallet
        const treasuryWallet = await sale.treasuryWallet();
        console.log("Treasury wallet:", treasuryWallet);

        // Get total ETH raised
        const totalEth = await sale.totalEthRaised();
        console.log("Total ETH raised:", totalEth.toString(), "wei");

        // Get total USDT raised
        const totalUsdt = await sale.totalUsdtRaised();
        console.log("Total USDT raised:", totalUsdt.toString(), "units");

        // Get token price
        const tokenPrice = await sale.TOKEN_PRICE_USD();
        console.log("Token price:", Number(tokenPrice) / 1e6, "USD");

        // Get min purchase
        const minPurchase = await sale.MIN_PURCHASE_USD();
        console.log("Min purchase:", Number(minPurchase) / 1e6, "USD");

        // Get max purchase
        const maxPurchase = await sale.MAX_PURCHASE_USD();
        console.log("Max purchase:", Number(maxPurchase) / 1e6, "USD");

        // Try reading MCT token address
        const mctToken = await sale.mctToken();
        console.log("MCT Token address:", mctToken);

        // Try reading USDT token address
        const usdtToken = await sale.usdtToken();
        console.log("USDT Token address:", usdtToken);

    } catch (error) {
        console.error("Error reading contract:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });