// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "./MoonCatToken.sol";

contract MoonCatStaking {
    MoonCatToken public token;
    address public owner;

    struct Stake {
        uint256 amount;
        uint256 since;
        uint256 unlockRequestTime;
        bool isLocked;  // New field to track lock status
    }

    mapping(address => Stake) public stakes7Days;
    mapping(address => Stake) public stakes1Year;

    // Update reward rates to be more precise (using basis points)
    // 2000 = 20% APR for 7 days
    // 3500 = 35% APR for 1 year
    uint256 public rewardRate7Days = 634;  // roughly 20% APR (2000 / 365 * 7 / 28)
    uint256 public rewardRate1Year = 959;  // roughly 35% APR (3500 / 365)

    uint256 public constant UNLOCK_PERIOD_7DAYS = 7 days;
    uint256 public constant UNLOCK_PERIOD_1YEAR = 365 days;
    uint256 public constant BASIS_POINTS = 10000;

    event Staked(address indexed user, uint256 amount, uint256 since, string stakeType);
    event UnlockRequested(address indexed user, uint256 unlockRequestTime, string stakeType);
    event Unstaked(address indexed user, uint256 amount, uint256 reward, string stakeType);
    event ForceUnlocked(address indexed user, uint256 amount, string stakeType);
    event RewardRateUpdated(string stakeType, uint256 newRate);

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    constructor(MoonCatToken _token) {
        token = _token;
        owner = msg.sender;
    }

    // Updated reward rate functions with validation
    function setRewardRate7Days(uint256 _newRate) public onlyOwner {
        require(_newRate <= 2000, "Rate too high"); // Max 20% APR
        rewardRate7Days = _newRate;
        emit RewardRateUpdated("7-Day", _newRate);
    }

    function setRewardRate1Year(uint256 _newRate) public onlyOwner {
        require(_newRate <= 3500, "Rate too high"); // Max 35% APR
        rewardRate1Year = _newRate;
        emit RewardRateUpdated("1-Year", _newRate);
    }

    // Updated interest calculation function
    function calculateInterest(
        uint256 amount,
        uint256 duration,
        uint256 rate
    ) internal pure returns (uint256) {
        // Calculate interest using basis points
        // (amount * rate * duration) / (BASIS_POINTS * 365 days)
        return (amount * rate * duration) / (BASIS_POINTS * 365 days);
    }

    // New force unlock functions
    function forceUnlock7Days() public {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        
        // Calculate reduced reward (50% penalty)
        uint256 duration = block.timestamp - userStake.since;
        uint256 reward = calculateInterest(userStake.amount, duration, rewardRate7Days) / 2;
        uint256 totalAmount = userStake.amount + reward;
        
        token.transfer(msg.sender, totalAmount);
        
        emit ForceUnlocked(msg.sender, userStake.amount, "7-Day");
        delete stakes7Days[msg.sender];
    }

    function forceUnlock1Year() public {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");
        
        // Calculate reduced reward (50% penalty)
        uint256 duration = block.timestamp - userStake.since;
        uint256 reward = calculateInterest(userStake.amount, duration, rewardRate1Year) / 2;
        uint256 totalAmount = userStake.amount + reward;
        
        token.transfer(msg.sender, totalAmount);
        
        emit ForceUnlocked(msg.sender, userStake.amount, "1-Year");
        delete stakes1Year[msg.sender];
    }

    // Updated stake7Days function
    function stake7Days(uint256 _amount) public {
        require(_amount > 0, "Cannot stake 0");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        
        token.transferFrom(msg.sender, address(this), _amount);
        
        Stake storage userStake = stakes7Days[msg.sender];
        
        if (userStake.amount > 0) {
            // Calculate accumulated interest before adding new stake
            uint256 duration = block.timestamp - userStake.since;
            uint256 reward = calculateInterest(userStake.amount, duration, rewardRate7Days);
            userStake.amount += reward;
        }
        
        userStake.amount += _amount;
        userStake.since = block.timestamp;
        userStake.unlockRequestTime = 0;
        userStake.isLocked = true;
        
        emit Staked(msg.sender, _amount, block.timestamp, "7-Day");
    }

    // Updated unstake7Days function with corrected interest calculation
    function unstake7Days() public {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime > 0, "Unlock not requested");
        require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD_7DAYS, "Lock period active");

        // Calculate interest only up to unlock request time
        uint256 duration = userStake.unlockRequestTime - userStake.since;
        uint256 reward = calculateInterest(userStake.amount, duration, rewardRate7Days);
        uint256 totalAmount = userStake.amount + reward;

        token.transfer(msg.sender, totalAmount);
        
        emit Unstaked(msg.sender, userStake.amount, reward, "7-Day");
        delete stakes7Days[msg.sender];
    }

    // View function to check current rewards
    function getAccumulatedRewards7Days(address _user) public view returns (uint256) {
        Stake storage userStake = stakes7Days[_user];
        if (userStake.amount == 0) return 0;
        
        uint256 duration;
        if (userStake.unlockRequestTime > 0) {
            duration = userStake.unlockRequestTime - userStake.since;
        } else {
            duration = block.timestamp - userStake.since;
        }
        
        return calculateInterest(userStake.amount, duration, rewardRate7Days);
    }
}