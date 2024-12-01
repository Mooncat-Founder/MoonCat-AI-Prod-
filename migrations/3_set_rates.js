const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  const stakingAddress = "0x30a301d3A0f8f9539518a20C4Dc0AbD9331d481D"; // Replace with your staking contract address

  // Get the contract ABI from artifacts
  const MoonCatStakingArtifact = await hre.artifacts.readArtifact("MoonCatStaking");

  // Create the contract instance connected to the deployer
  const moonCatStaking = new ethers.Contract(
    stakingAddress,
    MoonCatStakingArtifact.abi,
    deployer
  );

  console.log("Setting reward rates...");

  // Set 7-day rate
  let tx = await moonCatStaking.setRewardRate7Days(1999);
  await tx.wait();
  console.log("7-day rate set to:", (await moonCatStaking.rewardRate7Days()).toString());

  // Set 1-year rate
  tx = await moonCatStaking.setRewardRate1Year(3500);
  await tx.wait();
  console.log("1-year rate set to:", (await moonCatStaking.rewardRate1Year()).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Setting rates failed:", error);
    process.exit(1);
  });