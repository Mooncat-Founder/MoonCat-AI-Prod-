const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Initialize Web3
        const web3 = new Web3('https://sepolia.unichain.org');

        // Load ABI from artifacts
        const artifactPath = path.join(__dirname, '../artifacts/contracts/MoonCatStaking.sol/MoonCatStaking.json');
        const contractJson = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        const abi = contractJson.abi;

        const stakingAddress = "0x4f8442C6393332714081e66f6FA65938403ee058"; // Replace with your new contract address
        const testAddress = "0xe5dd89E9A619894862adb336Daa27759CA4D03DD";

        // Create contract instance
        const stakingContract = new web3.eth.Contract(abi, stakingAddress);

        // Get stake details
        const stake = await stakingContract.methods.stakes1Year(testAddress).call();
        const debugInfo = await stakingContract.methods.getDebugInfo().call();
        const rewards = await stakingContract.methods.getPendingRewards1Year(testAddress).call();
        const rate = await stakingContract.methods.rewardRate1Year().call();

        console.log("\nStake Info:", {
            amount: web3.utils.fromWei(stake.amount, 'ether') + " MCT",
            since: new Date(Number(stake.since) * 1000).toLocaleString(),
            isLocked: stake.isLocked,
            unlockRequestTime: stake.unlockRequestTime === '0' ? 'Not Requested' : new Date(Number(stake.unlockRequestTime) * 1000).toLocaleString()
        });

        console.log("\nContract Settings:", {
            isPaused: debugInfo.isPaused,
            rewardRate1Year: rate,
            rateAsAPR: (Number(rate) / 10000) * 100 + "%",
            lastRateChange: new Date(Number(debugInfo.lastChangeTime) * 1000).toLocaleString()
        });

        console.log("\nReward Calculation Data:");
        const currentTime = Math.floor(Date.now() / 1000);
        const duration = currentTime - Number(stake.since);
        console.log({
            currentTime: new Date(currentTime * 1000).toLocaleString(),
            stakingSince: new Date(Number(stake.since) * 1000).toLocaleString(),
            durationInDays: (duration / (24 * 60 * 60)).toFixed(2),
            pendingRewards: web3.utils.fromWei(rewards, 'ether') + " MCT"
        });

        // Get additional stake details
        const stakeDetails = await stakingContract.methods.getStakeDetails1Year(testAddress).call();
        console.log("\nDetailed Stake Info:", {
            stakedAmount: web3.utils.fromWei(stakeDetails.stakedAmount, 'ether') + " MCT",
            pendingRewards: web3.utils.fromWei(stakeDetails.pendingRewards, 'ether') + " MCT",
            isLocked: stakeDetails.isLocked,
            unlockRequestTime: stakeDetails.unlockRequestTime === '0' ? 'Not Requested' : new Date(Number(stakeDetails.unlockRequestTime) * 1000).toLocaleString(),
            timeStaked: new Date(Number(stakeDetails.timeStaked) * 1000).toLocaleString()
        });

    } catch (error) {
        console.error("Test failed:", error);
    }
}


async function debugRewards(stakingContract, address) {
    try {
        const stake = await stakingContract.methods.stakes1Year(address).call();
        const rate = await stakingContract.methods.rewardRate1Year().call();
        const currentTime = Math.floor(Date.now() / 1000);
        const duration = currentTime - Number(stake.since);
        const yearInSeconds = 365 * 24 * 60 * 60;
        const timeComponent = (duration * Number(rate)) / yearInSeconds;
        const expectedReward = (Number(stake.amount) * timeComponent) / 10000;
        
        console.log("Detailed Reward Calculation:");
        console.log("Stake Amount:", Web3.utils.fromWei(stake.amount), "MCT");
        console.log("Rate:", rate, `(${Number(rate)/100}%)`);
        console.log("Duration:", duration, "seconds", `(${duration/86400} days)`);
        console.log("Time Component:", timeComponent);
        console.log("Expected Reward:", expectedReward, "MCT");
        
        // Get actual reward from contract
        const actualReward = await stakingContract.methods.getPendingRewards1Year(address).call();
        console.log("Actual Contract Reward:", Web3.utils.fromWei(actualReward), "MCT");
        
    } catch (error) {
        console.error("Debug failed:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });