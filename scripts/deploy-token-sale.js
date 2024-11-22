const { ethers, network } = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Deploying with account:", deployer.address);
    console.log("Network:", network.name);
    
    // Get configuration from .env
    const TREASURY_WALLET = process.env.TREASURY_WALLET || deployer.address;
    const MCT_ADDRESS = process.env[`${network.name.toUpperCase()}_MCT_ADDRESS`];
    const USDT_ADDRESS = process.env[`${network.name.toUpperCase()}_USDT_ADDRESS`];
    const PRICE_FEED = process.env[`${network.name.toUpperCase()}_ETH_USD_PRICE_FEED`];
    
    // Get sale parameters from .env
    const RAISE_GOAL = process.env.RAISE_GOAL;
    const TOKEN_PRICE = process.env.TOKEN_PRICE;
    const MIN_CONTRIBUTION = process.env.MIN_CONTRIBUTION;
    const MAX_CONTRIBUTION = process.env.MAX_CONTRIBUTION;
    const TOKENS_FOR_SALE = (RAISE_GOAL / TOKEN_PRICE).toString();

    // Validate required environment variables
    if (!MCT_ADDRESS || !USDT_ADDRESS || !PRICE_FEED) {
        console.error(`Looking for these environment variables:`);
        console.error(`${network.name.toUpperCase()}_MCT_ADDRESS: ${MCT_ADDRESS}`);
        console.error(`${network.name.toUpperCase()}_USDT_ADDRESS: ${USDT_ADDRESS}`);
        console.error(`${network.name.toUpperCase()}_ETH_USD_PRICE_FEED: ${PRICE_FEED}`);
        throw new Error(
            `Missing required environment variables for network ${network.name}. Please check your .env file.`
        );
    }

    console.log("\nDeploying with the following configuration:");
    console.log("Treasury Wallet:", TREASURY_WALLET);
    console.log("MCT Token:", MCT_ADDRESS);
    console.log("USDT Token:", USDT_ADDRESS);
    console.log("Price Feed:", PRICE_FEED);
    console.log("Raise Goal:", RAISE_GOAL);
    console.log("Token Price:", TOKEN_PRICE);
    console.log("Min Contribution:", MIN_CONTRIBUTION);
    console.log("Max Contribution:", MAX_CONTRIBUTION);
    console.log("Tokens for sale:", TOKENS_FOR_SALE);

    // Deploy sale contract
    const Sale = await ethers.getContractFactory("TokenSaleWithOracle"); 
    const sale = await Sale.deploy(
        MCT_ADDRESS,
        USDT_ADDRESS,
        PRICE_FEED,
        TREASURY_WALLET
    );

    // Wait for deployment transaction
    const deploymentReceipt = await sale.deploymentTransaction().wait(1);
    const saleAddress = await sale.getAddress();
    
    console.log("\nSale contract deployed to:", saleAddress);
    console.log("Deployment transaction hash:", deploymentReceipt.hash);

    // Transfer MCT tokens to sale contract using IERC20 interface
    const IERC20_ABI = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)"
    ];
    
    const mctToken = new ethers.Contract(MCT_ADDRESS, IERC20_ABI, deployer);
    
    // Calculate tokens needed with tax compensation (1% tax)
    const desiredTokens = ethers.parseEther(TOKENS_FOR_SALE);
    // Adjust for 1% tax: amount = desired_amount / 0.99
    const adjustedTokenAmount = (desiredTokens * BigInt(100)) / BigInt(99);
    
    console.log("\nTransferring MCT tokens to sale contract...");
    console.log("Desired final amount:", ethers.formatEther(desiredTokens), "MCT");
    console.log("Amount to transfer (tax-adjusted):", ethers.formatEther(adjustedTokenAmount), "MCT");
    
    // Check balance before transfer
    const balance = await mctToken.balanceOf(deployer.address);
    console.log("Current balance:", ethers.formatEther(balance), "MCT");
    
    // Compare BigInt values
    if (balance < adjustedTokenAmount) {
        console.error("Insufficient MCT balance for transfer");
        console.error("Required (with tax):", ethers.formatEther(adjustedTokenAmount), "MCT");
        console.error("Available:", ethers.formatEther(balance), "MCT");
        process.exit(1);
    }

    console.log("Starting token transfer...");
    const transferTx = await mctToken.transfer(saleAddress, adjustedTokenAmount);
    console.log("Waiting for transfer transaction...");
    await transferTx.wait(); // Wait for the transfer to complete
    console.log("Tokens transferred successfully");
    
    // Verify final balances
    const finalBalance = await mctToken.balanceOf(saleAddress);
    console.log("\nFinal sale contract balance:", ethers.formatEther(finalBalance), "MCT");
    
    // Check if we received the expected amount after tax
    if (finalBalance < desiredTokens) {
        console.warn("\nWARNING: Final balance is less than desired amount!");
        console.warn("Expected:", ethers.formatEther(desiredTokens), "MCT");
        console.warn("Received:", ethers.formatEther(finalBalance), "MCT");
    }
    
    // Verify contract

    console.log("\nWaiting for more block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds
    
    console.log("\nVerifying contract...");
    try {
        await hre.run("verify:verify", {
            address: saleAddress,
            contract: "contracts/TokenSaleWithOracle.sol:TokenSaleWithOracle",  // Add this line
            constructorArguments: [
                MCT_ADDRESS,
                USDT_ADDRESS,
                PRICE_FEED,
                TREASURY_WALLET
            ],
            noCompile: true  // Add this line
        });
        console.log("Contract verified successfully");
    } catch (error) {
        console.error("Error verifying contract:", error);
    }


// Only one verification attempt
    if (network.name !== "hardhat" && network.name !== "localhost") {
        console.log("\nWaiting for block confirmations...");
        await new Promise(resolve => setTimeout(resolve, 60000)); // 60 second wait
        
        console.log("\nVerifying contract...");
        try {
            await hre.run("verify:verify", {
                address: saleAddress,
                constructorArguments: [
                    MCT_ADDRESS,
                    USDT_ADDRESS,
                    PRICE_FEED,
                    TREASURY_WALLET
                ]
            });
        } catch (error) {
            console.error("Verification error:", error);
            // Try manual verification command
            const verifyCommand = `npx hardhat verify --network ${network.name} ${saleAddress} "${MCT_ADDRESS}" "${USDT_ADDRESS}" "${PRICE_FEED}" "${TREASURY_WALLET}"`;
            console.log("\nTry verifying manually with:");
            console.log(verifyCommand);
        }
    }

    console.log("\nDeployment completed!");
    console.log("Sale contract address:", saleAddress);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });