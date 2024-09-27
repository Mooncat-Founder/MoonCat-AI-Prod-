require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const MoonCatToken = artifacts.require("MoonCatToken");
const Staking = artifacts.require("MoonCatStaking");
const fs = require('fs');
const path = require('path');

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

module.exports = async function (deployer) {
  const provider = new HDWalletProvider({
    privateKeys: [privateKey],
    providerOrUrl: `wss://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}` // Using WebSockets
  });

  try {
    // Deploy the MoonCatToken contract
    await deployer.deploy(MoonCatToken);
    const tokenInstance = await MoonCatToken.deployed();
    console.log("MoonCatToken deployed at:", tokenInstance.address);

    // Deploy the Staking contract, passing in the token address
    await deployer.deploy(Staking, tokenInstance.address);
    const stakingInstance = await Staking.deployed();
    console.log("Staking deployed at:", stakingInstance.address);

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
  } finally {
    provider.engine.stop();
  }
};
