# MoonCat Contracts Reference

## Deployment Information
- Token Address: `0xabe4629afd9A04da0891828F73EfbE37179c8c65`
- Staking Address: `0x07236348fd853560d0b9865d9d936Bc8e9eFB4f8`

## Current Staking Rates
- 7-Day Staking: 19.99%
- 1-Year Staking: 35.00%

## Common Usage Examples

### Token Functions
```javascript
// Approve staking contract
await tokenContract.approve("0x07236348fd853560d0b9865d9d936Bc8e9eFB4f8", "1000000000000000000")

// Transfer tokens
await tokenContract.transfer(recipient, "1000000000000000000")

// Check balance
await tokenContract.balanceOf(address)
```

### Staking Functions
```javascript
// Stake tokens (7 days)
await stakingContract.stake7Days("1000000000000000000")

// Request unlock
await stakingContract.requestUnlock7Days()

// Unstake
await stakingContract.unstake7Days()

// Force unlock (with penalty)
await stakingContract.forceUnlock7Days()

// Check pending rewards
await stakingContract.getPendingRewards7Days(address)
```

## Utility Functions
```javascript

                // Convert amount to wei (18 decimals)
                const toWei = (amount) => ethers.utils.parseEther(amount.toString());
                
                // Convert wei to amount
                const fromWei = (wei) => ethers.utils.formatEther(wei);
                


                // Calculate pending rewards
                const calculateRewards = (stakedAmount, duration, rate) => {
                    const BASIS_POINTS = 10000;
                    const YEAR_IN_SECONDS = 31536000; // 365 days
                    return (stakedAmount * duration * rate) / (BASIS_POINTS * YEAR_IN_SECONDS);
                };
                
```