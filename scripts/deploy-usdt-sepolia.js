const { ethers, network } = require("hardhat");
require("dotenv").config();

async function main() {
  // Retrieve the deployer account from Hardhat
  const [deployer] = await ethers.getSigners();
  console.log("Deploying USDT contract with account:", deployer.address);
  console.log("Network:", network.name);

  // Read token parameters from environment variables (or use defaults)
  const name = process.env.USDT_TOKEN_NAME || "Tether USD";
  const symbol = process.env.USDT_TOKEN_SYMBOL || "USDT";
  const decimals = 6; // USDT uses 6 decimals
  const initialSupply = process.env.USDT_INITIAL_SUPPLY || "1000000"; // e.g., 1,000,000 tokens

  // Use fully qualified name: "contracts/USDT-Sepolia.sol:USDT"
  const USDTFactory = await ethers.getContractFactory("contracts/USDT-Sepolia.sol:USDT");

  // Deploy the contract with the constructor arguments
  const usdt = await USDTFactory.deploy(name, symbol, decimals, initialSupply);
  
  // Wait for the deployment to be mined (ethers v6)
  await usdt.waitForDeployment();

  // Retrieve the deployed contract's address
  const contractAddress = await usdt.getAddress();
  console.log("USDT contract deployed at:", contractAddress);

  // If you need the deployment transaction hash, you must capture it differently,
  // but for testing your token sale contract, this line is not required.
  // console.log("Deployment transaction hash:", usdt.deployTransaction.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });
