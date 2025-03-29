const hre = require("hardhat");
const { ethers } = hre;
require('dotenv').config();

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  // Get staking address from .env
  const network = hre.network.name.toUpperCase();
  const stakingAddress = process.env[`${network}_STAKING_ADDRESS`];
  
  if (!stakingAddress) {
    throw new Error("STAKING_CONTRACT_ADDRESS_SEPOLIA not found in .env file");
  }

  console.log("Using staking contract address:", stakingAddress);

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