// scripts/clean-flattened.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function cleanFlattenedFile(contractName) {
    try {
        console.log(`\nCleaning ${contractName}...`);
        
        // Step 1: Flatten contract
        console.log('Flattening contract...');
        const contractPath = path.join(__dirname, '..', 'contracts', `${contractName}.sol`);
        const flattenedPath = path.join(__dirname, '..', 'verification', `${contractName}_flat.sol`);
        
        // Create verification directory if it doesn't exist
        const verificationDir = path.join(__dirname, '..', 'verification');
        if (!fs.existsSync(verificationDir)) {
            fs.mkdirSync(verificationDir);
        }

        // Flatten using hardhat
        execSync(`npx hardhat flatten ${contractPath} > "${flattenedPath}"`);
        
        // Step 2: Read and clean content
        console.log('Reading and cleaning content...');
        let content = fs.readFileSync(flattenedPath, 'utf8');

        // Clean up content
        console.log('Removing duplicate SPDX and pragma lines...');
        
        // Keep only first SPDX line
        const spdxLine = '// SPDX-License-Identifier: UNLICENSED\n';
        content = content.replace(/\/\/ SPDX-License-Identifier:.*\n/g, '');
        content = spdxLine + content;

        // Keep only first pragma line
        const pragmaLine = 'pragma solidity ^0.8.27;\n';
        content = content.replace(/pragma solidity [\^0-9\.]+;/g, '');
        content = pragmaLine + content;

        // Clean up spacing and line endings
        content = content.replace(/\r\n/g, '\n'); // Normalize line endings
        content = content.replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove extra empty lines
        content = content.trim() + '\n'; // Ensure single trailing newline

        // Step 3: Save cleaned file
        console.log('Saving cleaned file...');
        const cleanedPath = path.join(__dirname, '..', 'verification', `${contractName}_verified.sol`);
        fs.writeFileSync(cleanedPath, content, { encoding: 'utf8' });

        // Step 4: Verify the file is readable
        const testRead = fs.readFileSync(cleanedPath, 'utf8');
        if (testRead.length === 0) {
            throw new Error('Generated file is empty');
        }

        console.log(`Success! File saved to: verification/${contractName}_verified.sol`);
        
        // Optional: Remove the intermediate flat file
        fs.unlinkSync(flattenedPath);
        
        return true;

    } catch (error) {
        console.error(`Error processing ${contractName}:`, error);
        return false;
    }
}

async function main() {
    try {
        console.log('Starting contract preparation process...');

        // Process token contract
        const tokenSuccess = cleanFlattenedFile('MoonCatToken');
        if (!tokenSuccess) {
            throw new Error('Failed to process token contract');
        }

        // Process staking contract
        const stakingSuccess = cleanFlattenedFile('MoonCatStaking');
        if (!stakingSuccess) {
            throw new Error('Failed to process staking contract');
        }

        // Create verification instructions
        const instructions = `
Contract Verification Instructions

1. Token Contract (MoonCatToken):
   a. Go to Unichain Explorer
   b. Find your token contract
   c. Click "Verify & Publish"
   d. Enter these settings:
      - Contract Type: Solidity (Single file)
      - Compiler: v0.8.27+commit.40a35a09
      - Optimization: Yes
      - Optimization runs: 200
   e. Copy the ENTIRE content from verification/MoonCatToken_verified.sol
   f. Add constructor arguments from your deployment data

2. Staking Contract (MoonCatStaking):
   a. Go to Unichain Explorer
   b. Find your staking contract
   c. Click "Verify & Publish"
   d. Enter these settings:
      - Contract Type: Solidity (Single file)
      - Compiler: v0.8.27+commit.40a35a09
      - Optimization: Yes
      - Optimization runs: 200
   e. Copy the ENTIRE content from verification/MoonCatStaking_verified.sol
   f. Add constructor arguments from your deployment data

Note: Verify the token contract first, then the staking contract.
`;

        fs.writeFileSync(
            path.join(__dirname, '..', 'verification', 'INSTRUCTIONS.md'),
            instructions,
            'utf8'
        );

        console.log('\nContract preparation completed successfully!');
        console.log('Check the "verification" directory for the prepared files.');

    } catch (error) {
        console.error('\nError:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { cleanFlattenedFile };