require('dotenv').config();
const MoonCatToken = artifacts.require("MoonCatToken");
const Staking = artifacts.require("MoonCatStaking");
const fs = require('fs');
const path = require('path');

module.exports = async function (deployer, network) {
  try {
    console.log(`Starting deployment on network: ${network}`);

    // Deploy the MoonCatToken contract
    await deployer.deploy(MoonCatToken);
    const tokenInstance = await MoonCatToken.deployed();
    console.log("MoonCatToken deployed at:", tokenInstance.address);
    console.log(`Token deployment transaction hash: ${tokenInstance.transactionHash}`);

    // Deploy the Staking contract, passing in the token address
    await deployer.deploy(Staking, tokenInstance.address);
    const stakingInstance = await Staking.deployed();
    console.log("Staking deployed at:", stakingInstance.address);
    console.log(`Staking deployment transaction hash: ${stakingInstance.transactionHash}`);

    // Save deployment data to a file for future reference
    const deploymentData = {
      MoonCatToken: {
        address: tokenInstance.address,
        abi: tokenInstance.abi
      },
      Staking: {
        address: stakingInstance.address,
        abi: stakingInstance.abi
      }
    };

    const directoryPath = path.resolve(__dirname, 'deployed');
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }

    const filePath = path.resolve(directoryPath, `MoonCatTokenAndStaking-${deployer.network}.json`);
    fs.writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));

    console.log(`Contract deployment info saved to ${filePath}`);
  } catch (error) {
    console.error("Deployment failed:", error);
  }
};
