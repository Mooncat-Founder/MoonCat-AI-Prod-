const fs = require('fs');
const path = require('path');
const web3 = require('web3');
require('dotenv').config();

const MoonCatToken = artifacts.require("MoonCatToken");
const MoonCatStaking = artifacts.require("MoonCatStaking");

async function prepareVerification() {
    try {
        console.log('Preparing verification data...');

        // Create verification directory
        const verifyDir = path.join(__dirname, '..', 'verification');
        if (!fs.existsSync(verifyDir)) {
            fs.mkdirSync(verifyDir);
        }

        // Get deployed contract instances
        const token = await MoonCatToken.deployed();
        const staking = await MoonCatStaking.deployed();

        // Prepare token verification data
        console.log('\nPreparing Token verification data...');
        const tokenArgs = [
            process.env.TOKEN_NAME || "MoonCatToken",
            process.env.TOKEN_SYMBOL || "MCT",
            process.env.TOKEN_INITIAL_SUPPLY || "1000000000"
        ];

        // Read flattened token source
        const tokenSource = fs.readFileSync(
            path.join(__dirname, '..', 'flattened', 'MoonCatToken.sol'),
            'utf8'
        );

        // Save token verification data
        const tokenVerifyData = {
            contract_address: token.address,
            contract_name: 'MoonCatToken',
            compiler_version: 'v0.8.27+commit.40a35a09',
            optimization: true,
            optimization_runs: 200,
            constructor_arguments: tokenArgs,
            constructor_arguments_encoded: web3.eth.abi.encodeParameters(
                ['string', 'string', 'uint256'],
                tokenArgs
            ).slice(2),
            source_code: tokenSource,
            verify_steps: [
                "1. Go to https://explorer.unichain.network/address/" + token.address,
                "2. Click 'Verify & Publish'",
                "3. Enter the following settings:",
                "   - Compiler Version: v0.8.27+commit.40a35a09",
                "   - Optimization: Yes",
                "   - Optimization Runs: 200",
                "4. Copy source code from 'source_code' field below",
                "5. Copy constructor arguments from 'constructor_arguments_encoded' field"
            ]
        };

        fs.writeFileSync(
            path.join(verifyDir, 'token_verification.json'),
            JSON.stringify(tokenVerifyData, null, 2)
        );

        // Prepare staking verification data
        console.log('Preparing Staking verification data...');
        const stakingSource = fs.readFileSync(
            path.join(__dirname, '..', 'flattened', 'MoonCatStaking.sol'),
            'utf8'
        );

        const stakingArgs = [token.address];
        const stakingVerifyData = {
            contract_address: staking.address,
            contract_name: 'MoonCatStaking',
            compiler_version: 'v0.8.27+commit.40a35a09',
            optimization: true,
            optimization_runs: 200,
            constructor_arguments: stakingArgs,
            constructor_arguments_encoded: web3.eth.abi.encodeParameters(
                ['address'],
                stakingArgs
            ).slice(2),
            source_code: stakingSource,
            verify_steps: [
                "1. Go to https://explorer.unichain.network/address/" + staking.address,
                "2. Click 'Verify & Publish'",
                "3. Enter the following settings:",
                "   - Compiler Version: v0.8.27+commit.40a35a09",
                "   - Optimization: Yes",
                "   - Optimization Runs: 200",
                "4. Copy source code from 'source_code' field below",
                "5. Copy constructor arguments from 'constructor_arguments_encoded' field"
            ]
        };

        fs.writeFileSync(
            path.join(verifyDir, 'staking_verification.json'),
            JSON.stringify(stakingVerifyData, null, 2)
        );

        // Create a README with instructions
        const readmeContent = `
# Contract Verification Instructions

## Token Contract (${token.address})
1. Visit https://explorer.unichain.network/address/${token.address}
2. Click "Verify & Publish"
3. Use these settings:
   - Compiler Version: v0.8.27+commit.40a35a09
   - Optimization: Yes
   - Optimization Runs: 200
4. Copy the source code from token_verification.json
5. Copy the constructor arguments from token_verification.json (constructor_arguments_encoded field)

## Staking Contract (${staking.address})
1. Visit https://explorer.unichain.network/address/${staking.address}
2. Click "Verify & Publish"
3. Use these settings:
   - Compiler Version: v0.8.27+commit.40a35a09
   - Optimization: Yes
   - Optimization Runs: 200
4. Copy the source code from staking_verification.json
5. Copy the constructor arguments from staking_verification.json (constructor_arguments_encoded field)

Note: Verify the token contract first, then the staking contract.
`;

        fs.writeFileSync(
            path.join(verifyDir, 'README.md'),
            readmeContent.trim()
        );

        console.log('\nVerification data prepared successfully!');
        console.log('Check the "verification" directory for all necessary files and instructions.');

    } catch (error) {
        console.error('Error preparing verification data:', error);
    }
}

module.exports = function(callback) {
    prepareVerification()
        .then(() => callback())
        .catch(callback);
};