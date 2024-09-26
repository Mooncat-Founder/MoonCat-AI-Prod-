require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const { Alchemy, Network } = require('alchemy-sdk');
const fs = require('fs');
const path = require('path');
const MoonCatToken = artifacts.require("MoonCatToken");
const Staking = artifacts.require("Staking");

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;
const tokenName = process.env.TOKEN_NAME;
const tokenSymbol = process.env.TOKEN_SYMBOL;
const tokenInitialSupply = parseInt(process.env.TOKEN_INITIAL_SUPPLY, 10);

console.log("Private Key:", privateKey);
console.log("Alchemy API Key:", alchemyApiKey);
console.log("Token Name:", tokenName);
console.log("Token Symbol:", tokenSymbol);
console.log("Token Initial Supply:", tokenInitialSupply);

const settings = {
  apiKey: alchemyApiKey,
  network: Network.ETH_SEPOLIA,
};

const alchemy = new Alchemy(settings);
const provider = new HDWalletProvider({
  privateKeys: [privateKey],
  providerOrUrl: `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`
});

module.exports = async function(deployer) {
  try {
    // Deploy the MoonCatToken contract
    await deployer.deploy(MoonCatToken, tokenName, tokenSymbol, tokenInitialSupply);
    const tokenInstance = await MoonCatToken.deployed();
    console.log("MoonCatToken deployed at:", tokenInstance.address);

    // Deploy the Staking contract
    await deployer.deploy(Staking, tokenInstance.address);
    const stakingInstance = await Staking.deployed();
    console.log("Staking deployed at:", stakingInstance.address);

    // Prepare the contract data to be saved
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

    // Ensure the 'deployed' directory exists
    const directoryPath = path.resolve(__dirname, 'deployed');
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }

    // Save the contract data to a file
    const filePath = path.resolve(directoryPath, `MoonCatTokenAndStaking-${deployer.network}.json`);
    fs.writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));

    console.log(`Contract ABI and Address saved to ${filePath}`);
  } catch (error) {
    console.error("Deployment failed:", error);
  }
};
