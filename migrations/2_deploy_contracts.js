require('dotenv').config();
const MoonCatToken = artifacts.require("MoonCatToken");
const Staking = artifacts.require("MoonCatStaking");
const fs = require('fs');
const path = require('path');

module.exports = async function (deployer, network, accounts) {
  try {
    console.log(`Starting deployment on network: ${network}`);
    console.log(`Deployer address: ${accounts[0]}`);

    // Load parameters from .env
    const tokenName = process.env.TOKEN_NAME || "MoonCat";
    const tokenSymbol = process.env.TOKEN_SYMBOL || "MCT";
    const initialSupply = process.env.TOKEN_INITIAL_SUPPLY || "1000000";

    // Step 1: Deploy Token
    await deployer.deploy(MoonCatToken, tokenName, tokenSymbol, initialSupply);
    const tokenInstance = await MoonCatToken.deployed();
    console.log("Token deployed at:", tokenInstance.address);

    // Step 2: Deploy Staking
    await deployer.deploy(Staking, tokenInstance.address);
    const stakingInstance = await Staking.deployed();
    console.log("Staking deployed at:", stakingInstance.address);

    // Step 3: Setup Tax Exclusion
    await tokenInstance.excludeFromTax(stakingInstance.address);
    console.log("Staking contract excluded from tax");

    // Step 4: Verify Roles
    const roles = await stakingInstance.checkRoles(accounts[0]);
    console.log("Deployer roles:", {
      isAdmin: roles[0],
      isGovernor: roles[1],
      isPauser: roles[2]
    });

    // Save deployment info
    const deploymentData = {
      network,
      timestamp: new Date().toISOString(),
      deployer: accounts[0],
      contracts: {
        token: {
          address: tokenInstance.address,
          name: tokenName,
          symbol: tokenSymbol,
          initialSupply
        },
        staking: {
          address: stakingInstance.address
        }
      }
    };

    const directoryPath = path.resolve(__dirname, 'deployed');
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }

    const filePath = path.resolve(directoryPath, `deployment-${network}-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));
    console.log(`Deployment info saved to ${filePath}`);

  } catch (error) {
    console.error("\nDEPLOYMENT FAILED");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    if (error.receipt) {
      console.error("Transaction receipt:", JSON.stringify(error.receipt, null, 2));
    }
    throw error;
  }
};