require('dotenv').config();
const MoonCatToken = artifacts.require("MoonCatToken");
const Staking = artifacts.require("MoonCatStaking");
const fs = require('fs');
const path = require('path');

module.exports = async function (deployer, network) {
  try {
    console.log(`Starting deployment on network: ${network}`);

    // Load parameters from .env
    const tokenName = process.env.TOKEN_NAME;
    const tokenSymbol = process.env.TOKEN_SYMBOL;
    const initialSupply = process.env.TOKEN_INITIAL_SUPPLY;

    // Deploy MoonCatToken
    await deployer.deploy(MoonCatToken, tokenName, tokenSymbol, initialSupply);
    const tokenInstance = await MoonCatToken.deployed();
    console.log("MoonCatToken deployed at:", tokenInstance.address);

    // Deploy Staking
    await deployer.deploy(Staking, tokenInstance.address);
    const stakingInstance = await Staking.deployed();
    console.log("Staking deployed at:", stakingInstance.address);

    // Exclude staking contract from tax
    await tokenInstance.excludeFromTax(stakingInstance.address);
    console.log("Staking contract excluded from tax");

    // Set initial staking rates
    await stakingInstance.setRewardRate7Days(1999); // 19.99% APR
    await stakingInstance.setRewardRate1Year(3500); // 35% APR
    console.log("Initial staking rates set");

    // Save deployment data
    const deploymentData = {
      network,
      timestamp: new Date().toISOString(),
      MoonCatToken: {
        address: tokenInstance.address,
        abi: tokenInstance.abi,
        initialSupply,
        tokenName,
        tokenSymbol
      },
      Staking: {
        address: stakingInstance.address,
        abi: stakingInstance.abi,
        initialRates: {
          sevenDays: "19.99%",
          oneYear: "35%"
        }
      }
    };

    const directoryPath = path.resolve(__dirname, 'deployed');
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }

    const filePath = path.resolve(directoryPath, `MoonCatTokenAndStaking-${network}.json`);
    fs.writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));
    console.log(`Deployment info saved to ${filePath}`);

  } catch (error) {
    console.error("Deployment failed:", error);
    throw error;
  }
};