const hre = require("hardhat");
const ethersLib = require("ethers");
require('dotenv').config();

async function main() {
    const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS_SEPOLIA;
    const stakerAddress = "0xe5dd89E9A619894862adb336Daa27759CA4D03DD"; 

    console.log("Checking rewards for staker:", stakerAddress);

    const provider = hre.ethers.provider;
    
    const stakingContract = new ethersLib.Contract(
        stakingAddress,
        [
            "function getStakeDetails1Year(address) view returns (uint256 stakedAmount, uint256 pendingRewards, bool isLocked, uint256 unlockRequestTime, uint256 timeStaked, uint256 rate)",
            "function rewardRate1Year() view returns (uint256)"
        ],
        provider
    );

    // Get current global rate
    const globalRate = await stakingContract.rewardRate1Year();
    console.log('\nGlobal Rate:', globalRate.toString(), 'basis points', `(${Number(globalRate)/100}%)`);

    // Get stake details
    const stakeDetails = await stakingContract.getStakeDetails1Year(stakerAddress);
    
    console.log('\nStake Details:');
    console.log('------------------------');
    console.log('Staked Amount:', ethersLib.formatEther(stakeDetails.stakedAmount), 'tokens');
    console.log('Pending Rewards:', ethersLib.formatEther(stakeDetails.pendingRewards), 'tokens');
    console.log('Stake Rate:', stakeDetails.rate.toString(), 'basis points', `(${Number(stakeDetails.rate)/100}%)`);
    console.log('Is Locked:', stakeDetails.isLocked);
    
    // Convert timestamp to date
    const timeStaked = new Date(Number(stakeDetails.timeStaked) * 1000);
    console.log('Time Staked:', timeStaked.toLocaleString());
    
    // Check if unlocking was requested
    if (stakeDetails.unlockRequestTime > 0) {
        const unlockTime = new Date(Number(stakeDetails.unlockRequestTime) * 1000);
        console.log('Unlock Requested:', unlockTime.toLocaleString());
    }
    
    if (stakeDetails.rate.toString() !== globalRate.toString()) {
        console.log('\n✅ Stake rate remains independent from global rate');
        console.log(`Stake rate: ${Number(stakeDetails.rate)/100}% vs Global rate: ${Number(globalRate)/100}%`);
    } else {
        console.log('\n⚠️ Stake rate matches global rate - might indicate an issue');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });