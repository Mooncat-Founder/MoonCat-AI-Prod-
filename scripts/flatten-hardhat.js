const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(exec);

async function flattenContracts() {
    try {
        console.log('Flattening contracts...');

        // Create flattened directory if it doesn't exist
        const flattenedDir = path.join(__dirname, '..', 'flattened');
        if (!fs.existsSync(flattenedDir)) {
            fs.mkdirSync(flattenedDir);
        }

        // Flatten Token contract
        console.log('\nFlattening MoonCatToken...');
        await execAsync(
            'npx hardhat flatten contracts/MoonCatToken.sol > flattened/MoonCatToken.sol'
        );

        // Remove duplicate SPDX and pragma lines from token contract
        let tokenContent = fs.readFileSync('flattened/MoonCatToken.sol', 'utf8');
        tokenContent = removeDuplicateLicenses(tokenContent);
        fs.writeFileSync('flattened/MoonCatToken.sol', tokenContent);

        // Flatten Staking contract
        console.log('\nFlattening MoonCatStaking...');
        await execAsync(
            'npx hardhat flatten contracts/MoonCatStaking.sol > flattened/MoonCatStaking.sol'
        );

        // Remove duplicate SPDX and pragma lines from staking contract
        let stakingContent = fs.readFileSync('flattened/MoonCatStaking.sol', 'utf8');
        stakingContent = removeDuplicateLicenses(stakingContent);
        fs.writeFileSync('flattened/MoonCatStaking.sol', stakingContent);

        console.log('\nContracts flattened successfully!');
        console.log('Flattened contracts are in the "flattened" directory');

    } catch (error) {
        console.error('Error flattening contracts:', error);
    }
}

function removeDuplicateLicenses(content) {
    // Split the content into lines
    const lines = content.split('\n');
    
    // Keep track of what we've seen
    let seenSPDX = false;
    let seenPragma = false;
    
    // Filter out duplicate licenses and pragmas
    const filteredLines = lines.filter(line => {
        const isLicense = line.includes('SPDX-License-Identifier');
        const isPragma = line.includes('pragma solidity');
        
        if (isLicense) {
            if (seenSPDX) return false;
            seenSPDX = true;
            return true;
        }
        
        if (isPragma) {
            if (seenPragma) return false;
            seenPragma = true;
            return true;
        }
        
        return true;
    });
    
    return filteredLines.join('\n');
}

// Execute if running directly
if (require.main === module) {
    flattenContracts()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = flattenContracts;