const { ethers, network } = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Deploying with account:", deployer.address);
    console.log("Network:", network.name);
    
    // Debug environment variables
    const networkUpperCase = network.name.toUpperCase();
    console.log("Looking for environment variables with prefix:", networkUpperCase);
    console.log("MCT_ADDRESS env var name:", `${networkUpperCase}_MCT_ADDRESS`);
    console.log("Available env vars:", Object.keys(process.env).filter(key => key.includes('MCT_ADDRESS')));
    
    // Get configuration from .env
    const TREASURY_WALLET = process.env.TREASURY_WALLET || deployer.address;
    const MCT_ADDRESS = process.env[`${networkUpperCase}_MCT_ADDRESS`];
    const USDT_ADDRESS = process.env[`${networkUpperCase}_USDT_ADDRESS`];
    const PYTH_ADDRESS = process.env[`${networkUpperCase}_PYTH_ADDRESS`];
    
    // Get sale parameters from .env
    const RAISE_GOAL = process.env.RAISE_GOAL;
    const TOKEN_PRICE = process.env.TOKEN_PRICE;
    const MIN_CONTRIBUTION = process.env.MIN_CONTRIBUTION;
    const MAX_CONTRIBUTION = process.env.MAX_CONTRIBUTION;
    const TOKENS_FOR_SALE = (RAISE_GOAL / TOKEN_PRICE).toString();

    console.log("\nDeploying with the following configuration:");
    console.log("Treasury Wallet:", TREASURY_WALLET);
    console.log("MCT Token:", MCT_ADDRESS);
    console.log("USDT Token:", USDT_ADDRESS);
    console.log("Pyth Oracle:", PYTH_ADDRESS);
    console.log("Raise Goal:", RAISE_GOAL);
    console.log("Token Price:", TOKEN_PRICE);
    console.log("Min Contribution:", MIN_CONTRIBUTION);
    console.log("Max Contribution:", MAX_CONTRIBUTION);
    console.log("Tokens for sale:", TOKENS_FOR_SALE);

    // Deploy sale contract - Updated contract name here
    const Sale = await ethers.getContractFactory("TokenSaleWithPyth");
    const sale = await Sale.deploy(
        MCT_ADDRESS,
        USDT_ADDRESS,
        TREASURY_WALLET,
        PYTH_ADDRESS
    );

    // Wait for deployment transaction
    const deploymentReceipt = await sale.deploymentTransaction().wait(1);
    const saleAddress = await sale.getAddress();
    
    console.log("\nSale contract deployed to:", saleAddress);
    console.log("Deployment transaction hash:", deploymentReceipt.hash);

    // Transfer MCT tokens to sale contract
    const IERC20_ABI = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)"
    ];
    
    const mctToken = new ethers.Contract(MCT_ADDRESS, IERC20_ABI, deployer);
    
    // Calculate tokens needed with tax compensation (1% tax)
    const desiredTokens = ethers.parseEther(TOKENS_FOR_SALE);
    const adjustedTokenAmount = (desiredTokens * BigInt(100)) / BigInt(99);
    
    console.log("\nTransferring MCT tokens to sale contract...");
    console.log("Desired final amount:", ethers.formatEther(desiredTokens), "MCT");
    console.log("Amount to transfer (tax-adjusted):", ethers.formatEther(adjustedTokenAmount), "MCT");
    
    // Check balance before transfer
    const balance = await mctToken.balanceOf(deployer.address);
    console.log("Current balance:", ethers.formatEther(balance), "MCT");
    
    if (balance < adjustedTokenAmount) {
        console.error("Insufficient MCT balance for transfer");
        console.error("Required (with tax):", ethers.formatEther(adjustedTokenAmount), "MCT");
        console.error("Available:", ethers.formatEther(balance), "MCT");
        process.exit(1);
    }

    console.log("Starting token transfer...");
    const transferTx = await mctToken.transfer(saleAddress, adjustedTokenAmount);
    await transferTx.wait();
    console.log("Tokens transferred successfully");
    
    // Verify final balances
    const finalBalance = await mctToken.balanceOf(saleAddress);
    console.log("\nFinal sale contract balance:", ethers.formatEther(finalBalance), "MCT");
    
    if (finalBalance < desiredTokens) {
        console.warn("\nWARNING: Final balance is less than desired amount!");
        console.warn("Expected:", ethers.formatEther(desiredTokens), "MCT");
        console.warn("Received:", ethers.formatEther(finalBalance), "MCT");
    }

    // Verify contract
    if (network.name !== "hardhat" && network.name !== "localhost") {
        console.log("\nWaiting for block confirmations...");
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        console.log("\nVerifying contract...");
        try {
            await hre.run("verify:verify", {
                address: saleAddress,
                contract: "contracts/TokenSaleWithPyth.sol:TokenSaleWithPyth",  // Updated contract path
                constructorArguments: [
                    MCT_ADDRESS,
                    USDT_ADDRESS,
                    TREASURY_WALLET,
                    PYTH_ADDRESS
                ],
                noCompile: true
            });
            console.log("Contract verified successfully");
        } catch (error) {
            console.error("Verification error:", error);
            const verifyCommand = `npx hardhat verify --network ${network.name} ${saleAddress} "${MCT_ADDRESS}" "${USDT_ADDRESS}" "${TREASURY_WALLET}" "${PYTH_ADDRESS}"`;
            console.log("\nTry verifying manually with:");
            console.log(verifyCommand);
        }
    }

    console.log("\nExcluding sale contract from MCT tax...");
    const MCT_ABI = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function excludeFromTax(address account) external"
    ];
    
    const mctTokenWithExclude = new ethers.Contract(MCT_ADDRESS, MCT_ABI, deployer);
    
    try {
        const excludeTx = await mctTokenWithExclude.excludeFromTax(saleAddress);
        await excludeTx.wait();
        console.log("Sale contract successfully excluded from MCT tax");
    } catch (error) {
        console.error("Failed to exclude from tax:", error.message);
        console.warn("WARNING: Sale contract not excluded from tax. Please exclude manually.");
    }

    // Verify it worked
    const remainingTokens = await sale.remainingTokens();
    console.log("Remaining tokens initialized:", ethers.formatEther(remainingTokens));

    console.log("\nDeployment completed!");
    console.log("Sale contract address:", saleAddress);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });