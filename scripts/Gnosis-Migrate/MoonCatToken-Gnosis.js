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
    // Convert chainId to number to remove the 'n' suffix
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
        
        return safeAddress;
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

async function migrateMoonCatToken(safeAddress) {
  console.log("Starting MoonCatToken ownership migration...");
  
  // Debug log to check environment variable
  const tokenAddress = process.env.UNICHAIN-SEPOLIA-TESTNET_MCT_ADDRESS;
  console.log("Looking for MoonCat Token at address:", tokenAddress);
  
  if (!tokenAddress) {
    throw new Error("UNICHAIN_SEPOLIA_TESTNET_MCT_ADDRESS not found in environment variables");
  }

  const MoonCatToken = await ethers.getContractFactory("MoonCatToken");
  const token = MoonCatToken.attach(tokenAddress);
  
  // Verify current owner
  const currentOwner = await token.owner();
  console.log("Current token owner:", currentOwner);
  
  console.log("Transferring ownership to Safe...");
  const tx = await token.transferOwnership(safeAddress);
  console.log("Waiting for transaction:", tx.hash);
  await tx.wait();
  
  // Verify new owner
  const newOwner = await token.owner();
  console.log("New token owner:", newOwner);
  
  if (newOwner.toLowerCase() !== safeAddress.toLowerCase()) {
    throw new Error("Ownership transfer failed - please verify!");
  }
  
  console.log("MoonCatToken ownership successfully transferred to Safe:", safeAddress);
}

async function main() {
  try {
    console.log("Starting migration process...");
    
    const safeAddress = await deploySafe();
    
    console.log("Waiting for Safe deployment to be confirmed...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    await migrateMoonCatToken(safeAddress);
    
    console.log("\nMoonCatToken Migration Summary:");
    console.log("--------------------------------");
    console.log("Safe Address:", safeAddress);
    console.log("Token Address:", process.env.UNICHAIN-SEPOLIA-TESTNET_MCT_ADDRESS);
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