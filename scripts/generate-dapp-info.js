const fs = require('fs');
const path = require('path');
const MoonCatToken = artifacts.require("MoonCatToken");
const MoonCatStaking = artifacts.require("MoonCatStaking");

async function generateDappInfo() {
    try {
        console.log("Generating dApp information...");

        // Get contract instances
        const token = await MoonCatToken.deployed();
        const staking = await MoonCatStaking.deployed();

        // Get current rates and info
        const rate7Days = await staking.rewardRate7Days();
        const rate1Year = await staking.rewardRate1Year();
        const debugInfo = await staking.getDebugInfo();

        // Create clean ABIs (only function name, inputs, and outputs)
        const cleanTokenABI = MoonCatToken.abi.map(item => {
            if (item.type === 'function' || item.type === 'event') {
                return {
                    name: item.name,
                    type: item.type,
                    inputs: item.inputs,
                    outputs: item.outputs,
                    stateMutability: item.stateMutability
                };
            }
            return item;
        });

        const cleanStakingABI = MoonCatStaking.abi.map(item => {
            if (item.type === 'function' || item.type === 'event') {
                return {
                    name: item.name,
                    type: item.type,
                    inputs: item.inputs,
                    outputs: item.outputs,
                    stateMutability: item.stateMutability
                };
            }
            return item;
        });

        // Create dApp info object
        const dappInfo = {
            lastUpdated: new Date().toISOString(),
            contracts: {
                token: {
                    address: token.address,
                    abi: cleanTokenABI,
                    // Add common token functions example
                    examples: {
                        approve: `await tokenContract.approve("${staking.address}", "1000000000000000000")`,
                        transfer: 'await tokenContract.transfer(recipient, "1000000000000000000")',
                        balanceOf: 'await tokenContract.balanceOf(address)',
                    }
                },
                staking: {
                    address: staking.address,
                    abi: cleanStakingABI,
                    currentRates: {
                        sevenDays: {
                            rate: rate7Days.toString(),
                            apr: ((rate7Days.toNumber() / 100)).toFixed(2) + '%'
                        },
                        oneYear: {
                            rate: rate1Year.toString(),
                            apr: ((rate1Year.toNumber() / 100)).toFixed(2) + '%'
                        }
                    },
                    constants: {
                        MAX_RATE_7DAYS: '2000 (20% APR)',
                        MAX_RATE_1YEAR: '3500 (35% APR)',
                        UNLOCK_PERIOD_7DAYS: '7 days',
                        UNLOCK_PERIOD_1YEAR: '365 days',
                        FORCE_UNLOCK_PENALTY: '50%'
                    },
                    // Add common staking functions example
                    examples: {
                        stake7Days: `await stakingContract.stake7Days("1000000000000000000")`,
                        requestUnlock: 'await stakingContract.requestUnlock7Days()',
                        unstake: 'await stakingContract.unstake7Days()',
                        forceUnlock: 'await stakingContract.forceUnlock7Days()',
                        getPendingRewards: 'await stakingContract.getPendingRewards7Days(address)'
                    }
                }
            },
            stakingInfo: {
                currentStatus: {
                    isPaused: debugInfo[0],
                    lastRateChange: new Date(debugInfo[5].toNumber() * 1000).toISOString(),
                    timeUntilNextChange: debugInfo[6].toString() + " seconds",
                    canChangeRate: debugInfo[7]
                }
            },
            utils: {
                formatAmount: `
                // Convert amount to wei (18 decimals)
                const toWei = (amount) => ethers.utils.parseEther(amount.toString());
                
                // Convert wei to amount
                const fromWei = (wei) => ethers.utils.formatEther(wei);
                `,
                calculateRewards: `
                // Calculate pending rewards
                const calculateRewards = (stakedAmount, duration, rate) => {
                    const BASIS_POINTS = 10000;
                    const YEAR_IN_SECONDS = 31536000; // 365 days
                    return (stakedAmount * duration * rate) / (BASIS_POINTS * YEAR_IN_SECONDS);
                };
                `
            }
        };

        // Create readable file for developers
        const readableInfo = {
            token: {
                address: token.address,
                functions: cleanTokenABI
                    .filter(item => item.type === 'function')
                    .map(func => ({
                        name: func.name,
                        inputs: func.inputs,
                        outputs: func.outputs,
                        stateMutability: func.stateMutability
                    }))
            },
            staking: {
                address: staking.address,
                currentRates: dappInfo.contracts.staking.currentRates,
                constants: dappInfo.contracts.staking.constants,
                functions: cleanStakingABI
                    .filter(item => item.type === 'function')
                    .map(func => ({
                        name: func.name,
                        inputs: func.inputs,
                        outputs: func.outputs,
                        stateMutability: func.stateMutability
                    }))
            }
        };

        // Save files
        const outputDir = path.join(__dirname, '..', 'dapp-info');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }

        // Save full dApp info
        fs.writeFileSync(
            path.join(outputDir, 'dapp-info.json'), 
            JSON.stringify(dappInfo, null, 2)
        );

        // Save readable version
        fs.writeFileSync(
            path.join(outputDir, 'contracts-reference.json'), 
            JSON.stringify(readableInfo, null, 2)
        );

        // Create Markdown documentation
        const markdownDocs = `
# MoonCat Contracts Reference

## Deployment Information
- Token Address: \`${token.address}\`
- Staking Address: \`${staking.address}\`

## Current Staking Rates
- 7-Day Staking: ${dappInfo.contracts.staking.currentRates.sevenDays.apr}
- 1-Year Staking: ${dappInfo.contracts.staking.currentRates.oneYear.apr}

## Common Usage Examples

### Token Functions
\`\`\`javascript
// Approve staking contract
${dappInfo.contracts.token.examples.approve}

// Transfer tokens
${dappInfo.contracts.token.examples.transfer}

// Check balance
${dappInfo.contracts.token.examples.balanceOf}
\`\`\`

### Staking Functions
\`\`\`javascript
// Stake tokens (7 days)
${dappInfo.contracts.staking.examples.stake7Days}

// Request unlock
${dappInfo.contracts.staking.examples.requestUnlock}

// Unstake
${dappInfo.contracts.staking.examples.unstake}

// Force unlock (with penalty)
${dappInfo.contracts.staking.examples.forceUnlock}

// Check pending rewards
${dappInfo.contracts.staking.examples.getPendingRewards}
\`\`\`

## Utility Functions
\`\`\`javascript
${dappInfo.utils.formatAmount}

${dappInfo.utils.calculateRewards}
\`\`\`
`;

        fs.writeFileSync(
            path.join(outputDir, 'README.md'), 
            markdownDocs.trim()
        );

        console.log(`
dApp information generated successfully!
Files created in ${outputDir}:
- dapp-info.json (Full contract info and ABIs)
- contracts-reference.json (Clean reference)
- README.md (Markdown documentation)
        `);

    } catch (error) {
        console.error("Error generating dApp info:", error);
    }
}

module.exports = function(callback) {
    generateDappInfo()
        .then(() => callback())
        .catch(callback);
};