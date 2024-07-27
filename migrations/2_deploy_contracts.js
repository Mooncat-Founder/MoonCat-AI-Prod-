require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const { Alchemy, Network } = require('alchemy-sdk');
const MoontestToken = artifacts.require("MoontestToken");
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
    await deployer.deploy(MoontestToken, tokenName, tokenSymbol, tokenInitialSupply);
    const tokenInstance = await MoontestToken.deployed();
    console.log("MoontestToken deployed at:", tokenInstance.address);

    await deployer.deploy(Staking, tokenInstance.address);
    const stakingInstance = await Staking.deployed();
    console.log("Staking deployed at:", stakingInstance.address);
  } catch (error) {
    console.error("Deployment failed:", error);
  } finally {
    provider.engine.stop();
  }
};
