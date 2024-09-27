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
    event GovernanceTokenMinted(address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    constructor(MoonCatToken _token) {
        token = _token;
        owner = msg.sender;
        rewardRate7Days = 1.75E12; // Set your initial reward rates
        rewardRate1Year = 3.5E14;  // Higher reward rate for 1-year lock
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
        require(token.balanceOf(msg.sender, token.STAKING_TOKEN()) >= _amount, "Insufficient staking token balance");

        // Transfer staking tokens from user to contract
        token.safeTransferFrom(msg.sender, address(this), token.STAKING_TOKEN(), _amount, "");

        Stake storage userStake = stakes7Days[msg.sender];

        // Add to existing stake or create a new one
        if (userStake.amount > 0) {
            userStake.amount += _amount;
        } else {
            userStake.amount = _amount;
            userStake.since = block.timestamp;
        }
        userStake.unlockRequestTime = 0;

        // Mint governance tokens as a reward for staking
        uint256 governanceTokenAmount = _amount / 10; // For example, mint 10% of the staking amount
        token.mintGovernanceToken(msg.sender, governanceTokenAmount);
        emit GovernanceTokenMinted(msg.sender, governanceTokenAmount);

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
        token.safeTransferFrom(address(this), msg.sender, token.STAKING_TOKEN(), totalAmount, "");

        delete stakes7Days[msg.sender];

        emit Unstaked(msg.sender, userStake.amount, reward, "7-Day");
    }

    function withdrawInterest7Days() public {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime == 0, "Cannot withdraw interest while unlock is requested");

        uint256 reward = (block.timestamp - userStake.since) * rewardRate7Days * userStake.amount / 1e18;
        require(reward > 0, "No interest to withdraw");

        userStake.since = block.timestamp; // Reset since to current time
        token.safeTransferFrom(address(this), msg.sender, token.STAKING_TOKEN(), reward, "");
    }

    // -------------------- 1-Year Staking Functions --------------------

    function stake1Year(uint256 _amount) public {
        require(_amount > 0, "Cannot stake 0");
        require(token.balanceOf(msg.sender, token.STAKING_TOKEN()) >= _amount, "Insufficient staking token balance");

        // Transfer staking tokens from user to contract
        token.safeTransferFrom(msg.sender, address(this), token.STAKING_TOKEN(), _amount, "");

        Stake storage userStake = stakes1Year[msg.sender];

        if (userStake.amount > 0) {
            userStake.amount += _amount;
        } else {
            userStake.amount = _amount;
            userStake.since = block.timestamp;
        }
        userStake.unlockRequestTime = 0;

        // Mint governance tokens as a reward for staking
        uint256 governanceTokenAmount = _amount / 10; // For example, mint 10% of the staking amount
        token.mintGovernanceToken(msg.sender, governanceTokenAmount);
        emit GovernanceTokenMinted(msg.sender, governanceTokenAmount);

        emit Staked(msg.sender, _amount, block.timestamp, "1-Year");
    }

    function requestUnlock1Year() public {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");

        userStake.since = block.timestamp; // Stop interest accumulation
        userStake.unlockRequestTime = block.timestamp;

        emit UnlockRequested(msg.sender, userStake.unlockRequestTime, "1-Year");
    }

    function unstake1Year() public {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime > 0, "Unlock not requested");
        require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD_1YEAR, "Unlock period not reached");

        // Calculate reward
        uint256 reward = (userStake.unlockRequestTime + UNLOCK_PERIOD_1YEAR - userStake.since) * rewardRate1Year * userStake.amount / 1e18;

        uint256 totalAmount = userStake.amount + reward;

        // Transfer staking tokens back to the user
        token.safeTransferFrom(address(this), msg.sender, token.STAKING_TOKEN(), totalAmount, "");

        delete stakes1Year[msg.sender];

        emit Unstaked(msg.sender, userStake.amount, reward, "1-Year");
    }

    function withdrawInterest1Year() public {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime == 0, "Cannot withdraw interest while unlock is requested");

        uint256 reward = (block.timestamp - userStake.since) * rewardRate1Year * userStake.amount / 1e18;
        require(reward > 0, "No interest to withdraw");

        userStake.since = block.timestamp; // Reset since to current time
        token.safeTransferFrom(address(this), msg.sender, token.STAKING_TOKEN(), reward, "");
    }
}
