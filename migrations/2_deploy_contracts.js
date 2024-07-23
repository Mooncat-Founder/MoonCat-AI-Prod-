require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const MoontestToken = artifacts.require("MoontestToken");
const Staking = artifacts.require("Staking");

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const infuraProjectId = process.env.INFURA_PROJECT_ID;
const infuraProjectSecret = process.env.INFURA_PROJECT_SECRET;
const tokenName = process.env.TOKEN_NAME;
const tokenSymbol = process.env.TOKEN_SYMBOL;
const tokenInitialSupply = parseInt(process.env.TOKEN_INITIAL_SUPPLY, 10);

console.log("Private Key:", privateKey);
console.log("Infura Project ID:", infuraProjectId);
console.log("Infura Project Secret:", infuraProjectSecret);
console.log("Token Name:", tokenName);
console.log("Token Symbol:", tokenSymbol);
console.log("Token Initial Supply:", tokenInitialSupply);

const provider = new HDWalletProvider({
  privateKeys: [privateKey],
  providerOrUrl: `https://sepolia.infura.io/v3/${infuraProjectId}`,
  headers: [{ name: "Authorization", value: `Basic ${Buffer.from(infuraProjectId + ":" + infuraProjectSecret).toString("base64")}` }]
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
