const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MoonCatStaking Rate Change Tests", function () {
    this.timeout(120000); // 2 minute timeout for testnet

    let staking;
    let token;
    let owner;
    let player1;
    let player2;
    const STAKE_AMOUNT = ethers.utils.parseEther("500");  // Reduced to 500 tokens for testing
    
    before(async function () {
        [owner, player1, player2] = await ethers.getSigners();
        
        // Connect to existing contracts - replace with your deployed addresses
        staking = await ethers.getContractAt("MoonCatStaking", "YOUR_STAKING_CONTRACT_ADDRESS");
        token = await ethers.getContractAt("MoonCatToken", "YOUR_TOKEN_CONTRACT_ADDRESS");
        
        console.log("Connected to Staking at:", staking.address);
        console.log("Connected to Token at:", token.address);
        
        // Fund player1 if needed
        const player1Balance = await token.balanceOf(player1.address);
        console.log("Player1 initial balance:", ethers.utils.formatEther(player1Balance));
        
        if (player1Balance.lt(STAKE_AMOUNT)) {
            console.log("Funding player1...");
            // You might need to transfer tokens to player1 here
            // await token.transfer(player1.address, STAKE_AMOUNT);
        }
    });
    
    it("should verify rate independence", async function () {
        console.log("Starting rate independence test...");
        
        // Get current global rate
        const initialGlobalRate = await staking.rewardRate7Days();
        console.log("Initial global rate:", initialGlobalRate.toString());

        // Player 1 stakes
        console.log("Approving tokens...");
        await token.connect(player1).approve(staking.address, STAKE_AMOUNT);
        console.log("Staking tokens...");
        await staking.connect(player1).stake7Days(STAKE_AMOUNT);
        console.log("Stake successful");

        // Get initial stake details
        const initialStake = await staking.getStakeDetails7Days(player1.address);
        console.log("Initial stake rate:", initialStake.rate.toString());
        
        // Change global rate
        console.log("Changing global rate...");
        const newRate = 3000; // 30%
        await staking.connect(owner).setRewardRate7Days(newRate);
        console.log("Global rate changed");

        // Check if stake rate remained unchanged
        const afterChangeStake = await staking.getStakeDetails7Days(player1.address);
        console.log("Stake rate after global change:", afterChangeStake.rate.toString());

        expect(afterChangeStake.rate).to.equal(initialStake.rate);
        
        // Try opt-in
        console.log("Testing opt-in...");
        await staking.connect(player1).optInToNewRate(true);
        
        // Verify rate changed after opt-in
        const finalStake = await staking.getStakeDetails7Days(player1.address);
        console.log("Final rate after opt-in:", finalStake.rate.toString());
        
        expect(finalStake.rate).to.equal(newRate);
    });
});