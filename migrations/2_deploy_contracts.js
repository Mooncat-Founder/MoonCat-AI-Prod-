// Import the MoonCatToken contract artifact
const MoonCatToken = artifacts.require("MoonCatToken");

module.exports = function(deployer) {
    // Specify the initial supply of tokens (e.g., 10000 tokens, with 18 decimals)
    // The `web3.utils.toWei` function converts the amount into the smallest unit (wei)
    // Since ERC20 tokens use 18 decimals by default, we treat 1 token as 1 * 10^18 wei
    const initialSupply = web3.utils.toWei('10000', 'ether'); // 10,000 MoonCatToken tokens

    // Deploy the MoonCatToken contract with the specified initial supply
    deployer.deploy(MoonCatToken, initialSupply);
};
