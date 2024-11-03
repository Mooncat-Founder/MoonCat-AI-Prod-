const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  // Get the deployer account
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy MoonCatToken
  const MoonCatToken = await ethers.getContractFactory("MoonCatToken");
  const moonCatToken = await MoonCatToken.deploy("MoonCat", "MCT", "1000000000");
  await moonCatToken.waitForDeployment(); // Wait for deployment confirmation
  const moonCatTokenAddress = moonCatToken.target; // Use .target to get the contract address
  console.log("MoonCatToken deployed to:", moonCatTokenAddress);

  // Deploy MoonCatStaking
  const MoonCatStaking = await ethers.getContractFactory("MoonCatStaking");
  const moonCatStaking = await MoonCatStaking.deploy(moonCatTokenAddress);
  await moonCatStaking.waitForDeployment();
  const moonCatStakingAddress = moonCatStaking.target;
  console.log("MoonCatStaking deployed to:", moonCatStakingAddress);

  // Exclude Staking Contract from Tax
  const tx = await moonCatToken.excludeFromTax(moonCatStakingAddress);
  await tx.wait();
  console.log("Staking contract excluded from tax");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });