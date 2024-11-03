const hre = require("hardhat");

async function verifyRates() {
    try {
        const stakingAddress = "0x4f8442C6393332714081e66f6FA65938403ee058";
        
        // Get the contract factory
        const MoonCatStaking = await hre.ethers.getContractFactory("MoonCatStaking");
        
        // Get contract instance at deployed address
        const staking = MoonCatStaking.attach(stakingAddress);
        
        console.log("Fetching rates...");
        
        // Get current rates
        const rate7Days = await staking.rewardRate7Days();
        const rate1Year = await staking.rewardRate1Year();
        
        // Get debug info
        const debugInfo = await staking.getDebugInfo();
        
        console.log("\nContract Rates:");
        console.log("7-Day Rate:", rate7Days.toString(), `(${(Number(rate7Days) / 10000).toFixed(2)}% APR)`);
        console.log("1-Year Rate:", rate1Year.toString(), `(${(Number(rate1Year) / 10000).toFixed(2)}% APR)`);
        
        console.log("\nDebug Info:");
        console.log("Current 7-Day Rate:", debugInfo.currentRate7Days.toString());
        console.log("Current 1-Year Rate:", debugInfo.currentRate1Year.toString());
        console.log("Last Rate Change:", new Date(Number(debugInfo.lastChangeTime) * 1000).toLocaleString());
        
        // Get deployer info
        const [deployer] = await hre.ethers.getSigners();
        const hasGovernor = await staking.hasRole(
            hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes("GOVERNOR_ROLE")),
            deployer.address
        );
        
        console.log("\nDeployment Info:");
        console.log("Deployer Address:", deployer.address);
        console.log("Has Governor Role:", hasGovernor);
        
    } catch (error) {
        console.error("Error details:", {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }
}

verifyRates()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Verification failed:", error);
        process.exit(1);
    });