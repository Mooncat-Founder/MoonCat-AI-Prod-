const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const qs = require('qs');
require('dotenv').config();

const web3 = new Web3();
const MoonCatToken = artifacts.require("MoonCatToken");
const MoonCatStaking = artifacts.require("MoonCatStaking");

async function verifyContract(address, contractName, constructorArgs) {
    try {
        console.log(`\nVerifying ${contractName}...`);
        console.log('Contract address:', address);
        console.log('Constructor arguments:', JSON.stringify(constructorArgs, null, 2));

        // Read the flattened source code
        const sourceCode = fs.readFileSync(
            path.join(__dirname, '..', 'flattened', `${contractName}.sol`),
            'utf8'
        );

        // Format source code - remove BOM and normalize line endings
        const formattedSource = sourceCode
            .replace(/^\uFEFF/, '') // Remove BOM if present
            .replace(/\r\n/g, '\n'); // Normalize line endings

        // Encode constructor arguments based on contract
        let encodedArgs;
        if (contractName === 'MoonCatToken') {
            encodedArgs = web3.eth.abi.encodeParameters(
                ['string', 'string', 'uint256'],
                constructorArgs
            ).slice(2);
        } else if (contractName === 'MoonCatStaking') {
            encodedArgs = web3.eth.abi.encodeParameters(
                ['address'],
                constructorArgs
            ).slice(2);
        }

        const verificationData = {
            apikey: process.env.ETHERSCAN_API_KEY,
            module: 'contract',
            action: 'verifysourcecode',
            contractaddress: address,
            sourceCode: formattedSource,
            codeformat: 'solidity-single-file',
            contractname: contractName,
            compilerversion: 'v0.8.27+commit.40a35a09',
            optimizationUsed: 1,
            runs: 200,
            constructorArguments: encodedArgs,
            evmversion: 'paris',
            chainid: 1301
        };

        // Submit verification with proper encoding
        console.log('Submitting verification request...');
        const response = await axios.post(
            'https://api.etherscan.io/api',
            qs.stringify(verificationData),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            }
        );

        if (response.data.status === '1' || response.data.result === 'Contract source code already verified') {
            console.log(`✓ ${contractName} verified successfully!`);
            return true;
        }

        // If verification is pending, poll for status
        if (response.data.status === '0' && response.data.result === 'Pending in queue') {
            const guid = response.data.result;
            let verificationStatus = await pollVerificationStatus(guid);
            if (verificationStatus) {
                console.log(`✓ ${contractName} verified successfully!`);
                return true;
            }
        }

        console.error(`✗ Verification failed:`, response.data.result);
        return false;

    } catch (error) {
        console.error(`Error verifying ${contractName}:`);
        if (error.response) {
            console.error('API Response:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
        return false;
    }
}

async function pollVerificationStatus(guid) {
    let attempts = 0;
    const maxAttempts = 10;
    const delay = 5000; // 5 seconds

    while (attempts < maxAttempts) {
        try {
            const response = await axios.get(
                'https://api.etherscan.io/api',
                {
                    params: {
                        apikey: process.env.ETHERSCAN_API_KEY,
                        module: 'contract',
                        action: 'checkverifystatus',
                        guid: guid
                    }
                }
            );

            if (response.data.status === '1') {
                return true;
            }

            if (response.data.result !== 'Pending in queue') {
                return false;
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            attempts++;
        } catch (error) {
            console.error('Error checking verification status:', error);
            return false;
        }
    }

    return false;
}

async function verifyContracts() {
    try {
        console.log('Starting contract verification process...');

        const token = await MoonCatToken.deployed();
        const staking = await MoonCatStaking.deployed();

        const tokenName = "MoonCatToken";
        const tokenSymbol = "MCT";
        const initialSupply = "1000000000";

        console.log('\nContract Addresses:');
        console.log('Token:', token.address);
        console.log('Staking:', staking.address);

        // Verify Token first
        const tokenVerified = await verifyContract(
            token.address,
            'MoonCatToken',
            [tokenName, tokenSymbol, initialSupply]
        );

        if (tokenVerified) {
            await verifyContract(
                staking.address,
                'MoonCatStaking',
                [token.address]
            );
        }

    } catch (error) {
        console.error('\nVerification process failed:', error.message);
    }
}

module.exports = function(callback) {
    verifyContracts()
        .then(() => callback())
        .catch(callback);
};