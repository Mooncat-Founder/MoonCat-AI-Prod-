require('dotenv').config();
const VariableToken = artifacts.require("VariableToken");

module.exports = function(deployer) {
    // Retrieve environment variables
    const name = process.env.TOKEN_NAME;
    const symbol = process.env.TOKEN_SYMBOL;
    const initialSupply = web3.utils.toWei('1000000000', 'ether'); // Example initial supply

    // Deploy the contract with the specified name, symbol, and initial supply
    deployer.deploy(VariableToken, name, symbol, initialSupply);
};
