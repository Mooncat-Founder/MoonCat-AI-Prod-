const fs = require('fs');
const path = require('path');
const hre = require("hardhat");

async function generateDappInfo() {
    try {
        console.log("Generating dApp information...");

        // Get contract addresses
        const tokenAddress = "TOKEN_CONTRACT_ADDRESS"; // Replace with your deployed token contract address
        const stakingAddress = "STAKING_CONTRACT_ADDRESS"; // Replace with your deployed staking contract address

        // Get contract instances
        const token = await hre.ethers.getContractAt("MoonCatToken", tokenAddress);
        const staking = await hre.ethers.getContractAt("MoonCatStaking", stakingAddress);

        // Get ABIs from artifacts
        const MoonCatTokenArtifact = await hre.artifacts.readArtifact("MoonCatToken");
        const MoonCatStakingArtifact = await hre.artifacts.readArtifact("MoonCatStaking");

        // Get current rates and info
        const rate7Days = await staking.rewardRate7Days();
        const rate1Year = await staking.rewardRate1Year();
        const debugInfo = await staking.getDebugInfo();

        // Clean ABIs (only function name, inputs, and outputs)
        const cleanTokenABI = MoonCatTokenArtifact.abi.map(item => {
            if (item.type === 'function' || item.type === 'event') {
                return {
                    name: item.name,
                    type: item.type,
                    inputs: item.inputs,
                    outputs: item.outputs,
                    stateMutability: item.stateMutability
                };
            }
            return null;
        }).filter(item => item !== null);

        const cleanStakingABI = MoonCatStakingArtifact.abi.map(item => {
            if (item.type === 'function' || item.type === 'event') {
                return {
                    name: item.name,
                    type: item.type,
                    inputs: item.inputs,
                    outputs: item.outputs,
                    stateMutability: item.stateMutability
                };
            }
            return null;
        }).filter(item => item !== null);

        // Create dApp info object
        const dappInfo = {
            lastUpdated: new Date().toISOString(),
            contracts: {
                token: {
                    address: tokenAddress,
                    abi: cleanTokenABI,
                    examples: {
                        approve: `await tokenContract.approve("${stakingAddress}", "1000000000000000000")`,
                        transfer: 'await tokenContract.transfer(recipient, "1000000000000000000")',
                        balanceOf: 'await tokenContract.balanceOf(address)',
                    }
                },
                staking: {
                    address: stakingAddress,
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
                    isPaused: debugInfo.isPaused,
                    lastRateChange: new Date(debugInfo.lastRateChange.toNumber() * 1000).toISOString(),
                    timeUntilNextChange: debugInfo.timeUntilNextChange.toString() + " seconds",
                    canChangeRate: debugInfo.canChangeRate
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
                address: tokenAddress,
                functions: cleanTokenABI
            },
            staking: {
                address: stakingAddress,
                currentRates: dappInfo.contracts.staking.currentRates,
                constants: dappInfo.contracts.staking.constants,
                functions: cleanStakingABI
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
- Token Address: \`${tokenAddress}\`
- Staking Address: \`${stakingAddress}\`

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

generateDappInfo();
