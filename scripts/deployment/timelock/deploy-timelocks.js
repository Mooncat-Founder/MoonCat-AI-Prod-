// scripts/TimeLock/deploy-timelocks.js
const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log(`Deploying timelocks with proper role assignments...`);
  
  // Get network name from hardhat
  const network = await ethers.provider.getNetwork();
  const networkName = network.name.toUpperCase();
  console.log(`Deploying on network: ${networkName}`);
  
  // Get safe addresses using network prefix
  const safes = {
    stakingSafe: process.env[`${networkName}_MOONCAT_STAKING_SAFE`],
    tokenSale: process.env[`${networkName}_TOKEN_SALE_SAFE`]
  };
  
  if (!safes.stakingSafe || !safes.tokenSale) {
    throw new Error(`Missing Safe addresses in .env file for network ${networkName}`);
  }
  
  console.log("Using Safe addresses:");
  console.log(`- Staking Safe: ${safes.stakingSafe}`);
  console.log(`- Token Sale Safe: ${safes.tokenSale}`);
  
  // Timelock delay
  const timelockDelay = Number(process.env.TIMELOCK_DELAY) || 3600;
  console.log(`Timelock delay: ${timelockDelay} seconds (${timelockDelay/3600} hours)`);
  
  // Get the deployer
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  
  // Deploy Staking Timelock
  console.log("\nDeploying MoonCatStakingTimelock...");
  const StakingTimelock = await ethers.getContractFactory("MoonCatStakingTimelock");
  
  // Deploy with correct roles from the start
  const stakingTimelock = await StakingTimelock.deploy(
    timelockDelay,
    [safes.stakingSafe],  // proposers array - Safe can propose
    [safes.stakingSafe]   // executors array - Safe can execute
  );
  
  await stakingTimelock.waitForDeployment();
  const stakingTimelockAddress = await stakingTimelock.getAddress();
  console.log(`MoonCatStakingTimelock deployed to: ${stakingTimelockAddress}`);
  
  // Deploy Sale Timelock
  console.log("\nDeploying MoonCatSaleTimelock...");
  const SaleTimelock = await ethers.getContractFactory("MoonCatSaleTimelock");
  
  // Deploy with correct roles from the start
  const saleTimelock = await SaleTimelock.deploy(
    timelockDelay,
    [safes.tokenSale],  // proposers array - Safe can propose
    [safes.tokenSale]   // executors array - Safe can execute
  );
  
  await saleTimelock.waitForDeployment();
  const saleTimelockAddress = await saleTimelock.getAddress();
  console.log(`MoonCatSaleTimelock deployed to: ${saleTimelockAddress}`);
  
  // Verify role assignment
  const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
  const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
  
  console.log("\nVerifying role assignments:");
  
  // Verify staking timelock roles
  const stakingSafeHasProposerRole = await stakingTimelock.hasRole(PROPOSER_ROLE, safes.stakingSafe);
  const stakingSafeHasExecutorRole = await stakingTimelock.hasRole(EXECUTOR_ROLE, safes.stakingSafe);
  
  console.log(`Staking Safe has PROPOSER_ROLE: ${stakingSafeHasProposerRole}`);
  console.log(`Staking Safe has EXECUTOR_ROLE: ${stakingSafeHasExecutorRole}`);
  
  // Verify sale timelock roles
  const saleSafeHasProposerRole = await saleTimelock.hasRole(PROPOSER_ROLE, safes.tokenSale);
  const saleSafeHasExecutorRole = await saleTimelock.hasRole(EXECUTOR_ROLE, safes.tokenSale);
  
  console.log(`Sale Safe has PROPOSER_ROLE: ${saleSafeHasProposerRole}`);
  console.log(`Sale Safe has EXECUTOR_ROLE: ${saleSafeHasExecutorRole}`);
  
  // Print summary and next steps
  console.log("\nDeployment complete!");
  console.log(`Staking Timelock: ${stakingTimelockAddress}`);
  console.log(`Sale Timelock: ${saleTimelockAddress}`);
  console.log("\nUpdate your .env file with these addresses:");
  console.log(`${networkName}_STAKING_TIMELOCK_ADDRESS=${stakingTimelockAddress}`);
  console.log(`${networkName}_SALE_TIMELOCK_ADDRESS=${saleTimelockAddress}`);
  console.log("\nNext step: Run transfer-to-timelocks.js to transfer control to the timelocks");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });