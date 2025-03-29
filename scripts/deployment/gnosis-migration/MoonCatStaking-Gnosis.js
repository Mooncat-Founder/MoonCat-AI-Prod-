// scripts/Staking-Gnosis.js
require('dotenv').config();
const { ethers } = require('hardhat');

async function migrateStakingContract() {
  console.log("Starting MoonCatStaking roles migration...");
  
  // Get network name for the environment variable format in the .env file
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name.toUpperCase();
  
  // Get Safe address from .env file
  const safeAddress = process.env[`${networkName}_MOONCAT_STAKING_SAFE`];
  if (!safeAddress) {
    throw new Error(`${networkName}_MOONCAT_STAKING_SAFE not found in environment variables`);
  }
  console.log("Using Safe address:", safeAddress);
  
  // Using the network name to construct the environment variable name
  const stakingAddress = process.env[`${networkName}_STAKING_ADDRESS`];
  console.log("Looking for MoonCatStaking at address:", stakingAddress);
  
  if (!stakingAddress) {
    throw new Error(`${networkName}_STAKING_ADDRESS not found in environment variables`);
  }

  const MoonCatStaking = await ethers.getContractFactory("MoonCatStaking");
  const staking = MoonCatStaking.attach(stakingAddress);
  
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  
  // Check current roles
  const deployerAddress = await deployer.getAddress();
  console.log("Checking current roles for deployer:", deployerAddress);
  
  const deployerHasAdmin = await staking.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress);
  const deployerHasGovernor = await staking.hasRole(GOVERNOR_ROLE, deployerAddress);
  const deployerHasPauser = await staking.hasRole(PAUSER_ROLE, deployerAddress);
  
  console.log(`Deployer has DEFAULT_ADMIN_ROLE: ${deployerHasAdmin}`);
  console.log(`Deployer has GOVERNOR_ROLE: ${deployerHasGovernor}`);
  console.log(`Deployer has PAUSER_ROLE: ${deployerHasPauser}`);
  
  if (!deployerHasAdmin) {
    throw new Error("Deployer doesn't have DEFAULT_ADMIN_ROLE. Cannot proceed with role transfer.");
  }
  
  console.log("Granting roles to Safe...");
  
  console.log("Granting DEFAULT_ADMIN_ROLE...");
  const grantAdminTx = await staking.grantRole(DEFAULT_ADMIN_ROLE, safeAddress);
  console.log("Waiting for transaction:", grantAdminTx.hash);
  await grantAdminTx.wait();
  
  console.log("Granting GOVERNOR_ROLE...");
  const grantGovernorTx = await staking.grantRole(GOVERNOR_ROLE, safeAddress);
  console.log("Waiting for transaction:", grantGovernorTx.hash);
  await grantGovernorTx.wait();
  
  console.log("Granting PAUSER_ROLE...");
  const grantPauserTx = await staking.grantRole(PAUSER_ROLE, safeAddress);
  console.log("Waiting for transaction:", grantPauserTx.hash);
  await grantPauserTx.wait();
  
  console.log("Verifying role assignments...");
  const hasAdmin = await staking.hasRole(DEFAULT_ADMIN_ROLE, safeAddress);
  const hasGovernor = await staking.hasRole(GOVERNOR_ROLE, safeAddress);
  const hasPauser = await staking.hasRole(PAUSER_ROLE, safeAddress);
  
  if (!hasAdmin || !hasGovernor || !hasPauser) {
    throw new Error("Role assignment verification failed!");
  }
  
  console.log("Safe has all required roles. Proceeding to revoke deployer roles...");
  
  // UNCOMMENTED: The following block revokes deployer roles
  console.log("Revoking deployer roles...");
  
  console.log("Revoking GOVERNOR_ROLE...");
  const revokeGovernorTx = await staking.renounceRole(GOVERNOR_ROLE, deployerAddress);
  console.log("Waiting for transaction:", revokeGovernorTx.hash);
  await revokeGovernorTx.wait();
  
  console.log("Revoking PAUSER_ROLE...");
  const revokePauserTx = await staking.renounceRole(PAUSER_ROLE, deployerAddress);
  console.log("Waiting for transaction:", revokePauserTx.hash);
  await revokePauserTx.wait();
  
  console.log("Revoking DEFAULT_ADMIN_ROLE...");
  const revokeAdminTx = await staking.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress);
  console.log("Waiting for transaction:", revokeAdminTx.hash);
  await revokeAdminTx.wait();
  
  // Verify roles were revoked
  console.log("Verifying role revocation...");
  const deployerStillHasAdmin = await staking.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress);
  const deployerStillHasGovernor = await staking.hasRole(GOVERNOR_ROLE, deployerAddress);
  const deployerStillHasPauser = await staking.hasRole(PAUSER_ROLE, deployerAddress);
  
  if (deployerStillHasAdmin || deployerStillHasGovernor || deployerStillHasPauser) {
    console.log("WARNING: Not all roles were revoked!");
    console.log(`Deployer still has DEFAULT_ADMIN_ROLE: ${deployerStillHasAdmin}`);
    console.log(`Deployer still has GOVERNOR_ROLE: ${deployerStillHasGovernor}`);
    console.log(`Deployer still has PAUSER_ROLE: ${deployerStillHasPauser}`);
  } else {
    console.log("All roles successfully revoked from deployer.");
  }
  
  console.log("MoonCatStaking roles successfully transferred to Safe:", safeAddress);
  return { safeAddress, stakingAddress };
}

async function main() {
  try {
    console.log("Starting migration process...");
    
    const { safeAddress, stakingAddress } = await migrateStakingContract();
    
    console.log("\nMoonCatStaking Migration Summary:");
    console.log("--------------------------------");
    console.log("Safe Address:", safeAddress);
    console.log("Staking Contract Address:", stakingAddress);
    console.log("Migration Status: Complete");
    
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });