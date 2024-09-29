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
    }

    mapping(address => Stake) public stakes7Days;
    mapping(address => Stake) public stakes1Year;

    uint256 public rewardRate7Days;
    uint256 public rewardRate1Year;

    uint256 public constant UNLOCK_PERIOD_7DAYS = 7 days;
    uint256 public constant UNLOCK_PERIOD_1YEAR = 365 days;

    event Staked(address indexed user, uint256 amount, uint256 since, string stakeType);
    event UnlockRequested(address indexed user, uint256 unlockRequestTime, string stakeType);
    event Unstaked(address indexed user, uint256 amount, uint256 reward, string stakeType);

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    constructor(MoonCatToken _token) {
        token = _token;
        owner = msg.sender;
        rewardRate7Days = 6.34E11;  // Set your initial reward rates
        rewardRate1Year = 1.108E12; // Higher reward rate for 1-year lock
    }

    // Owner functions to update reward rates
    function setRewardRate7Days(uint256 _newRate) public onlyOwner {
        rewardRate7Days = _newRate;
    }

    function setRewardRate1Year(uint256 _newRate) public onlyOwner {
        rewardRate1Year = _newRate;
    }

    // -------------------- 7-Day Staking Functions --------------------
    function stake7Days(uint256 _amount) public {
        require(_amount > 0, "Cannot stake 0");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient staking token balance");

        // Transfer staking tokens from user to contract
        token.transferFrom(msg.sender, address(this), _amount);

        Stake storage userStake = stakes7Days[msg.sender];

        if (userStake.amount > 0) {
            userStake.amount += _amount;
        } else {
            userStake.amount = _amount;
            userStake.since = block.timestamp;
        }
        userStake.unlockRequestTime = 0;

        emit Staked(msg.sender, _amount, block.timestamp, "7-Day");
    }

    function requestUnlock7Days() public {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");

        userStake.since = block.timestamp; // Stop interest accumulation
        userStake.unlockRequestTime = block.timestamp;

        emit UnlockRequested(msg.sender, userStake.unlockRequestTime, "7-Day");
    }

    function unstake7Days() public {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime > 0, "Unlock not requested");
        require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD_7DAYS, "Unlock period not reached");

        // Calculate reward
        uint256 reward = (userStake.unlockRequestTime - userStake.since) * rewardRate7Days * userStake.amount / 1e18;
        uint256 totalAmount = userStake.amount + reward;

        // Transfer staking tokens back to the user
        token.transfer(msg.sender, totalAmount);

        delete stakes7Days[msg.sender];

        emit Unstaked(msg.sender, userStake.amount, reward, "7-Day");
    }

    // -------------------- 1-Year Staking Functions --------------------
    function stake1Year(uint256 _amount) public {
        require(_amount > 0, "Cannot stake 0");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient staking token balance");

        token.transferFrom(msg.sender, address(this), _amount);

        Stake storage userStake = stakes1Year[msg.sender];

        if (userStake.amount > 0) {
            userStake.amount += _amount;
        } else {
            userStake.amount = _amount;
            userStake.since = block.timestamp;
        }
        userStake.unlockRequestTime = 0;

        emit Staked(msg.sender, _amount, block.timestamp, "1-Year");
    }

    function requestUnlock1Year() public {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");

        userStake.since = block.timestamp;
        userStake.unlockRequestTime = block.timestamp;

        emit UnlockRequested(msg.sender, userStake.unlockRequestTime, "1-Year");
    }

    function unstake1Year() public {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime > 0, "Unlock not requested");
        require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD_1YEAR, "Unlock period not reached");

        uint256 reward = (userStake.unlockRequestTime + UNLOCK_PERIOD_1YEAR - userStake.since) * rewardRate1Year * userStake.amount / 1e18;
        uint256 totalAmount = userStake.amount + reward;

        token.transfer(msg.sender, totalAmount);

        delete stakes1Year[msg.sender];

        emit Unstaked(msg.sender, userStake.amount, reward, "1-Year");
    }

    // -------------------- Unified Interest Withdrawal --------------------
    function withdrawAllInterest() public {
        uint256 totalReward;

        // Check for 7-day pool interest
        if (stakes7Days[msg.sender].amount > 0) {
            uint256 reward7Days = (block.timestamp - stakes7Days[msg.sender].since) * rewardRate7Days * stakes7Days[msg.sender].amount / 1e18;
            totalReward += reward7Days;
            stakes7Days[msg.sender].since = block.timestamp; // Reset staking time for 7-day pool
        }

        // Check for 1-year pool interest
        if (stakes1Year[msg.sender].amount > 0) {
            uint256 reward1Year = (block.timestamp - stakes1Year[msg.sender].since) * rewardRate1Year * stakes1Year[msg.sender].amount / 1e18;
            totalReward += reward1Year;
            stakes1Year[msg.sender].since = block.timestamp; // Reset staking time for 1-year pool
        }

        require(totalReward > 0, "No interest to withdraw");
        token.transfer(msg.sender, totalReward);
    }
}
