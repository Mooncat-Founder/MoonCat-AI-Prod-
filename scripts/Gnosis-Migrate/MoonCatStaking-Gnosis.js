require('dotenv').config();
const { ethers } = require('hardhat');
const path = require('path');
const safeConfig = require(path.join(process.cwd(), 'multisig_keys.json'));

const SAFE_FACTORY_ABI = [
  "event ProxyCreation(address indexed proxy, address indexed singleton)",
  "function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (address proxy)"
];

const SAFE_ABI = [
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)"
];

const SAFE_PROXY_FACTORY = "0xd9d2Ba03a7754250FDD71333F444636471CACBC4";
const SAFE_IMPLEMENTATION = "0x639245e8476E03e789a244f279b5843b9633b2E7";

async function deploySafe() {
  console.log("Starting Safe deployment process...");
  
  try {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", await deployer.getAddress());

    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance));

    const network = await deployer.provider.getNetwork();
    const chainId = Number(network.chainId);
    console.log("Network:", network.name, "ChainId:", chainId);

    const factory = new ethers.Contract(
      SAFE_PROXY_FACTORY,
      SAFE_FACTORY_ABI,
      deployer
    );

    const safeSingleton = new ethers.Contract(
      SAFE_IMPLEMENTATION,
      SAFE_ABI,
      deployer
    );

    console.log("Preparing Safe setup data...");
    console.log("Safe owners:", safeConfig.safeConfig.owners);
    console.log("Threshold:", safeConfig.safeConfig.threshold);

    const setupData = safeSingleton.interface.encodeFunctionData("setup", [
      safeConfig.safeConfig.owners,
      safeConfig.safeConfig.threshold,
      ethers.ZeroAddress,
      "0x",
      "0xcB4a8d3609A7CCa2D9c063a742f75c899BF2f7b5",
      ethers.ZeroAddress,
      0,
      ethers.ZeroAddress
    ]);

    console.log("Creating Safe proxy...");
    const saltNonce = ethers.hexlify(ethers.randomBytes(32));
    
    const tx = await factory.createProxyWithNonce(
      SAFE_IMPLEMENTATION,
      setupData,
      saltNonce,
      {
        gasLimit: 1000000
      }
    );

    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("Transaction confirmed. Block number:", receipt.blockNumber);

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === SAFE_PROXY_FACTORY.toLowerCase()) {
        const safeAddress = ethers.getAddress('0x' + log.topics[1].slice(26));
        console.log("Safe successfully deployed at:", safeAddress);
        
        const code = await deployer.provider.getCode(safeAddress);
        if (code === '0x') {
          throw new Error('Safe deployment failed - no code at address');
        }
        
        return { safeAddress, deployer };
      }
    }

    throw new Error("Could not find ProxyCreation event in logs");

  } catch (error) {
    console.error("Error in deploySafe:");
    console.error(error);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    throw error;
  }
}

async function migrateStakingContract(safeAddress, deployer) {
  console.log("Starting MoonCatStaking roles migration...");
  
  const stakingAddress = process.env["STAKING_CONTRACT_ADDDRESS_SEPOLIA"];
  console.log("Looking for MoonCatStaking at address:", stakingAddress);
  
  if (!stakingAddress) {
    throw new Error("STAKING_CONTRACT_ADDDRESS_SEPOLIA not found in environment variables");
  }

  const MoonCatStaking = await ethers.getContractFactory("MoonCatStaking");
  const staking = MoonCatStaking.attach(stakingAddress);
  
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  
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
  
  console.log("Revoking deployer roles...");
  const deployerAddress = await deployer.getAddress();
  console.log("Revoking roles from:", deployerAddress);
  
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
  
  console.log("MoonCatStaking roles successfully transferred to Safe:", safeAddress);
}

async function main() {
  try {
    console.log("Starting migration process...");
    
    const { safeAddress, deployer } = await deploySafe();
    
    console.log("Waiting for Safe deployment to be confirmed...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    await migrateStakingContract(safeAddress, deployer);
    
    console.log("\nMoonCatStaking Migration Summary:");
    console.log("--------------------------------");
    console.log("Safe Address:", safeAddress);
    console.log("Staking Contract Address:", process.env["STAKING_CONTRACT_ADDDRESS_SEPOLIA"]);
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