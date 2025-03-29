async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Deploying with account:", deployer.address);
    console.log("Network:", network.name);
    
    // Get configuration from .env
    const networkUpperCase = network.name.toUpperCase();
    const TREASURY_WALLET = process.env.TREASURY_WALLET || deployer.address;
    const MCT_ADDRESS = process.env[`${networkUpperCase}_MCT_ADDRESS`];
    const USDT_ADDRESS = process.env[`${networkUpperCase}_USDT_ADDRESS`];
    const PYTH_ADDRESS = process.env['UNICHAIN_PYTH_ADDRESS'];
    const TOKENS_FOR_SALE = (process.env.RAISE_GOAL / process.env.TOKEN_PRICE).toString();

    console.log("\nDeploying with the following configuration:");
    console.log("Treasury Wallet:", TREASURY_WALLET);
    console.log("MCT Token:", MCT_ADDRESS);
    console.log("USDT Token:", USDT_ADDRESS);
    console.log("Pyth Oracle:", PYTH_ADDRESS);
    console.log("Tokens for sale:", TOKENS_FOR_SALE);

    // Deploy sale contract
    const Sale = await ethers.getContractFactory("TokenSaleWithPyth");
    const sale = await Sale.deploy(
        MCT_ADDRESS,
        USDT_ADDRESS,
        TREASURY_WALLET,
        PYTH_ADDRESS
    );

    const deploymentReceipt = await sale.deploymentTransaction().wait(1);
    const saleAddress = await sale.getAddress();
    
    console.log("\nSale contract deployed to:", saleAddress);
    console.log("Deployment transaction hash:", deploymentReceipt.hash);

    // Transfer MCT tokens
    const mctToken = new ethers.Contract(
        MCT_ADDRESS, 
        ["function transfer(address,uint256)", "function balanceOf(address)", "function excludeFromTax(address)"],
        deployer
    );
    
    const desiredTokens = ethers.parseEther(TOKENS_FOR_SALE);
    const adjustedTokenAmount = (desiredTokens * BigInt(100)) / BigInt(99);
    
    console.log("\nTransferring MCT tokens to sale contract...");
    const transferTx = await mctToken.transfer(saleAddress, adjustedTokenAmount);
    await transferTx.wait();
    
    // Exclude from tax
    console.log("\nExcluding sale contract from MCT tax...");
    const excludeTx = await mctToken.excludeFromTax(saleAddress);
    await excludeTx.wait();

    // Reset remaining tokens
    console.log("\nResetting remaining tokens...");
    const resetTx = await sale.resetRemainingTokens();
    await resetTx.wait();
    console.log("Remaining tokens reset successfully");

    // Verify contract
    if (network.name !== "hardhat" && network.name !== "localhost") {
        console.log("\nWaiting before verification...");
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        try {
            await hre.run("verify:verify", {
                address: saleAddress,
                constructorArguments: [MCT_ADDRESS, USDT_ADDRESS, TREASURY_WALLET, PYTH_ADDRESS]
            });
            console.log("Contract verified successfully");
        } catch (error) {
            console.error("Verification failed:", error.message);
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