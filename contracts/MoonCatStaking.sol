// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "./MoonCatToken.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract MoonCatStaking is ReentrancyGuard, AccessControl, Pausable {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    MoonCatToken public immutable token;
    
    struct Stake {
        uint256 amount;
        uint256 since;
        uint256 unlockRequestTime;
        bool isLocked;
    }

    struct StakingStats {
        uint256 totalStaked;
        uint256 totalCompounded;
        uint256 totalWithdrawn;
        uint256 currentPendingRewards;
    }

    mapping(address => Stake) public stakes7Days;
    mapping(address => Stake) public stakes1Year;
    mapping(address => StakingStats) public stakingStats7Days;
    mapping(address => StakingStats) public stakingStats1Year;
    
    uint256 public rewardRate7Days;
    uint256 public rewardRate1Year;
    
    uint256 public constant UNLOCK_PERIOD_7DAYS = 7 days;
    uint256 public constant UNLOCK_PERIOD_1YEAR = 365 days;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant FORCE_UNLOCK_PENALTY = 5000; // 50% penalty
    uint256 public constant MAX_RATE_7DAYS = 5000;      // 50% APR max
    uint256 public constant MAX_RATE_1YEAR = 9900;      // 99% APR max
    uint256 public constant RATE_CHANGE_COOLDOWN = 7 days;
    uint256 public constant MAX_STAKE_AMOUNT = 1_000_000 ether; // 1 million tokens
    uint256 public constant YEAR_IN_SECONDS = 365 days; 


    bool public emergencyMode;
    uint256 public lastRateChange;

    event Staked(address indexed user, uint256 amount, uint256 since, string indexed stakeType);
    event UnlockRequested(address indexed user, uint256 unlockRequestTime, string indexed stakeType);
    event Unstaked(address indexed user, uint256 amount, uint256 reward, string indexed stakeType);
    event ForceUnlocked(address indexed user, uint256 amount, uint256 penalty, string indexed stakeType);
    event InterestWithdrawn(address indexed user, uint256 reward, string indexed stakeType);
    event EmergencyWithdraw(address indexed user, uint256 amount, uint256 fee);
    event RateChanged(string indexed stakeType, uint256 oldRate, uint256 newRate);
    event EmergencyModeEnabled(address indexed by);
    event StakeCompounded(address indexed user, uint256 originalAmount, uint256 compoundedInterest, uint256 newTotal, string indexed stakeType);


    modifier rateChangeAllowed() {
        require(block.timestamp >= lastRateChange + RATE_CHANGE_COOLDOWN, "Rate change too soon");
        _;
    }

    constructor(MoonCatToken _token) {
        require(address(_token) != address(0), "Token cannot be zero address");
        token = _token;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNOR_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        
        // Set initial rates
        rewardRate7Days = 634;  // ~6.34% APR
        rewardRate1Year = 959;  // ~9.59% APR
        lastRateChange = block.timestamp;
    }

    function stake7Days(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Cannot stake 0");
        require(_amount <= MAX_STAKE_AMOUNT, "Amount exceeds maximum");
        require(stakes7Days[msg.sender].amount + _amount <= MAX_STAKE_AMOUNT, "Total would exceed maximum");
        
        Stake storage userStake = stakes7Days[msg.sender];
        
        if (userStake.amount > 0 && userStake.isLocked) {
            uint256 originalAmount = userStake.amount;
            uint256 reward = calculatePendingRewards(userStake, rewardRate7Days);
            userStake.amount += reward;
            userStake.since = block.timestamp;
            
            if (reward > 0) {
                stakingStats7Days[msg.sender].totalCompounded += reward;
                emit StakeCompounded(msg.sender, originalAmount, reward, userStake.amount, "7-Day");
            }
        }

        require(token.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        userStake.amount += _amount;
        userStake.since = block.timestamp;
        userStake.isLocked = true;
        userStake.unlockRequestTime = 0;
        stakingStats7Days[msg.sender].totalStaked += _amount;
        
        emit Staked(msg.sender, _amount, block.timestamp, "7-Day");
    }

    function requestUnlock7Days() external whenNotPaused {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime == 0, "Already unlocking");

        // Compound any pending rewards before starting unlock
        uint256 reward = calculatePendingRewards(userStake, rewardRate7Days);
        if (reward > 0) {
            userStake.amount += reward;
            stakingStats7Days[msg.sender].totalCompounded += reward;
        }

        // Update stake timing
        userStake.since = block.timestamp;
        userStake.unlockRequestTime = block.timestamp;

        emit UnlockRequested(msg.sender, block.timestamp, "7-Day");
    }

    function unstake7Days() external nonReentrant whenNotPaused {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime > 0, "Unlock not requested");
        require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD_7DAYS, "Still locked");

        // Calculate final rewards before unstaking
        uint256 reward = calculatePendingRewards(userStake, rewardRate7Days);
        uint256 totalAmount = userStake.amount;
        
        if (reward > 0) {
            totalAmount += reward;
            stakingStats7Days[msg.sender].totalWithdrawn += reward;
        }

        delete stakes7Days[msg.sender];
        
        require(token.transfer(msg.sender, totalAmount), "Transfer failed");
        emit Unstaked(msg.sender, userStake.amount, reward, "7-Day");
    }

    // Add function to check if unlock period is complete
    function isUnlockComplete(Stake memory stake, bool is7Days) public view returns (bool) {
        if (stake.unlockRequestTime == 0) return false;
        uint256 unlockPeriod = is7Days ? UNLOCK_PERIOD_7DAYS : UNLOCK_PERIOD_1YEAR;
        return block.timestamp >= stake.unlockRequestTime + unlockPeriod;
    }

    function forceUnlock7Days() external nonReentrant whenNotPaused {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        
        uint256 penalty = (userStake.amount * FORCE_UNLOCK_PENALTY) / BASIS_POINTS;
        uint256 amountAfterPenalty = userStake.amount - penalty;
        
        delete stakes7Days[msg.sender];
        
        require(token.transfer(msg.sender, amountAfterPenalty), "Transfer failed");
        emit ForceUnlocked(msg.sender, amountAfterPenalty, penalty, "7-Day");
    }

        function stake1Year(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Cannot stake 0");
        require(_amount <= MAX_STAKE_AMOUNT, "Amount exceeds maximum");
        require(stakes1Year[msg.sender].amount + _amount <= MAX_STAKE_AMOUNT, "Total would exceed maximum");
        
        Stake storage userStake = stakes1Year[msg.sender];
        
        if (userStake.amount > 0 && userStake.isLocked) {
            uint256 originalAmount = userStake.amount;
            uint256 reward = calculatePendingRewards(userStake, rewardRate1Year);
            userStake.amount += reward;
            userStake.since = block.timestamp;
            
            if (reward > 0) {
                stakingStats1Year[msg.sender].totalCompounded += reward;
                emit StakeCompounded(msg.sender, originalAmount, reward, userStake.amount, "1-Year");
            }
        }

        require(token.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        userStake.amount += _amount;
        userStake.since = block.timestamp;
        userStake.isLocked = true;
        userStake.unlockRequestTime = 0;
        stakingStats1Year[msg.sender].totalStaked += _amount;
        
        emit Staked(msg.sender, _amount, block.timestamp, "1-Year");
    }

     function requestUnlock1Year() external whenNotPaused {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime == 0, "Already unlocking");

        // Compound any pending rewards before starting unlock
        uint256 reward = calculatePendingRewards(userStake, rewardRate1Year);
        if (reward > 0) {
            userStake.amount += reward;
            stakingStats1Year[msg.sender].totalCompounded += reward;
        }

        // Update stake timing
        userStake.since = block.timestamp;
        userStake.unlockRequestTime = block.timestamp;

        emit UnlockRequested(msg.sender, block.timestamp, "1-Year");
    }

function unstake1Year() external nonReentrant whenNotPaused {
    Stake storage userStake = stakes1Year[msg.sender];
    require(userStake.amount > 0, "No stake found");
    require(userStake.unlockRequestTime > 0, "Unlock not requested");
    require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD_1YEAR, "Still locked");

    // Calculate final rewards before unstaking
    uint256 reward = calculatePendingRewards(userStake, rewardRate1Year);
    uint256 totalAmount = userStake.amount;
    
    if (reward > 0) {
        totalAmount += reward;
        stakingStats1Year[msg.sender].totalWithdrawn += reward;
    }

    delete stakes1Year[msg.sender];
    
    require(token.transfer(msg.sender, totalAmount), "Transfer failed");
    emit Unstaked(msg.sender, userStake.amount, reward, "1-Year");
}

    function forceUnlock1Year() external nonReentrant whenNotPaused {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");
        
        uint256 penalty = (userStake.amount * FORCE_UNLOCK_PENALTY) / BASIS_POINTS;
        uint256 amountAfterPenalty = userStake.amount - penalty;
        
        delete stakes1Year[msg.sender];
        
        require(token.transfer(msg.sender, amountAfterPenalty), "Transfer failed");
        emit ForceUnlocked(msg.sender, amountAfterPenalty, penalty, "1-Year");
    }

    function withdrawAllInterest() external nonReentrant whenNotPaused {
        uint256 totalReward = 0;

        // Withdraw interest from 7-Day Stake
        uint256 reward7Days = _withdrawInterest7Days(msg.sender);
        totalReward += reward7Days;

        // Withdraw interest from 1-Year Stake
        uint256 reward1Year = _withdrawInterest1Year(msg.sender);
        totalReward += reward1Year;

        require(totalReward > 0, "No rewards available");

        // Transfer total rewards to the user
        require(token.transfer(msg.sender, totalReward), "Transfer failed");

        emit InterestWithdrawn(msg.sender, totalReward, "All");
    }

    function _withdrawInterest7Days(address user) internal returns (uint256) {
        Stake storage userStake = stakes7Days[user];
        if (userStake.amount == 0) {
            return 0;
        }

        uint256 reward = calculatePendingRewards(userStake, rewardRate7Days);
        if (reward > 0) {
            userStake.since = block.timestamp;
            stakingStats7Days[user].totalWithdrawn += reward;
        }
        return reward;
    }

    function _withdrawInterest1Year(address user) internal returns (uint256) {
        Stake storage userStake = stakes1Year[user];
        if (userStake.amount == 0) {
            return 0;
        }

        uint256 reward = calculatePendingRewards(userStake, rewardRate1Year);
        if (reward > 0) {
            userStake.since = block.timestamp;
            stakingStats1Year[user].totalWithdrawn += reward;
        }
        return reward;
    }

    function setRewardRate7Days(uint256 _newRate) external onlyRole(GOVERNOR_ROLE) whenNotPaused {
        require(_newRate <= MAX_RATE_7DAYS, "Rate too high");
        
        if (lastRateChange != 0 && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            require(block.timestamp >= lastRateChange + RATE_CHANGE_COOLDOWN, "Rate change too soon");
        }
        
        uint256 oldRate = rewardRate7Days;
        rewardRate7Days = _newRate;
        lastRateChange = block.timestamp;
        emit RateChanged("7-Day", oldRate, _newRate);
    }

    function setRewardRate1Year(uint256 _newRate) external onlyRole(GOVERNOR_ROLE) whenNotPaused {
        require(_newRate <= MAX_RATE_1YEAR, "Rate too high");
        
        if (lastRateChange != 0 && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            require(block.timestamp >= lastRateChange + RATE_CHANGE_COOLDOWN, "Rate change too soon");
        }
        
        uint256 oldRate = rewardRate1Year;
        rewardRate1Year = _newRate;
        lastRateChange = block.timestamp;
        emit RateChanged("1-Year", oldRate, _newRate);
    }

    function enableEmergencyMode() external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyMode = true;
        _pause();
        emit EmergencyModeEnabled(msg.sender);
    }

    function emergencyWithdraw() external nonReentrant {
        require(emergencyMode, "Emergency mode not active");
        
        uint256 totalAmount = 0;

        Stake storage userStake7Days = stakes7Days[msg.sender];
        if (userStake7Days.amount > 0) {
            totalAmount += userStake7Days.amount;
            delete stakes7Days[msg.sender];
        }

        Stake storage userStake1Year = stakes1Year[msg.sender];
        if (userStake1Year.amount > 0) {
            totalAmount += userStake1Year.amount;
            delete stakes1Year[msg.sender];
        }

        require(totalAmount > 0, "No stake found");
        require(token.transfer(msg.sender, totalAmount), "Transfer failed");
        emit EmergencyWithdraw(msg.sender, totalAmount, 0); // Fee is always 0
    }

    // View Functions
    function calculatePendingRewards(
        Stake memory stake,
        uint256 rate
    ) public view returns (uint256) {
        if (stake.amount == 0 || !stake.isLocked) {
            return 0;
        }
        
        // Calculate the duration in seconds
        uint256 stakeDuration;
        if (stake.unlockRequestTime > 0) {
            uint256 unlockPeriod = rate == rewardRate7Days ? UNLOCK_PERIOD_7DAYS : UNLOCK_PERIOD_1YEAR;
            uint256 unlockCompleteTime = stake.unlockRequestTime + unlockPeriod;
            
            if (block.timestamp >= unlockCompleteTime) {
                // If unlock period is complete, calculate interest up to unlock completion
                stakeDuration = unlockCompleteTime - stake.since;
            } else {
                // If still in unlock period, calculate interest up to current time
                stakeDuration = block.timestamp - stake.since;
            }
        } else {
            // If not unlocking, calculate up to current time
            stakeDuration = block.timestamp - stake.since;
        }
        
        // Calculate interest: principal * rate * time
        uint256 interest = (stake.amount * rate * stakeDuration) / (BASIS_POINTS * YEAR_IN_SECONDS);
        
        return interest;
    }
 
    // New view functions for stake details and stats
    function getStakeDetails7Days(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        bool isLocked,
        uint256 unlockRequestTime,
        uint256 timeStaked
    ) {
        Stake memory stake = stakes7Days[user];
        return (
            stake.amount,
            calculatePendingRewards(stake, rewardRate7Days),
            stake.isLocked,
            stake.unlockRequestTime,
            stake.since
        );
    }

    function getStakeDetails1Year(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        bool isLocked,
        uint256 unlockRequestTime,
        uint256 timeStaked
    ) {
        Stake memory stake = stakes1Year[user];
        return (
            stake.amount,
            calculatePendingRewards(stake, rewardRate1Year),
            stake.isLocked,
            stake.unlockRequestTime,
            stake.since
        );
    }

    function getAllStakingStats(address user) external view returns (
        StakingStats memory stats7Days,
        StakingStats memory stats1Year
    ) {
        stats7Days = stakingStats7Days[user];
        stats1Year = stakingStats1Year[user];
        
        // Update current pending rewards
        Stake memory stake7 = stakes7Days[user];
        Stake memory stake1 = stakes1Year[user];
        
        stats7Days.currentPendingRewards = calculatePendingRewards(stake7, rewardRate7Days);
        stats1Year.currentPendingRewards = calculatePendingRewards(stake1, rewardRate1Year);
        
        return (stats7Days, stats1Year);
    }

    // Access Control Functions
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

  // Add a view function to get time until unlock completion
    function getTimeUntilUnlock(address user, bool is7Days) external view returns (uint256) {
        Stake memory stake = is7Days ? stakes7Days[user] : stakes1Year[user];
        if (stake.unlockRequestTime == 0) return 0;
        
        uint256 unlockPeriod = is7Days ? UNLOCK_PERIOD_7DAYS : UNLOCK_PERIOD_1YEAR;
        uint256 unlockTime = stake.unlockRequestTime + unlockPeriod;
        
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    function debugCalculation(
        address user,
        bool is7Days
    ) external view returns (
        uint256 stakeAmount,
        uint256 stakeDuration,
        uint256 rate,
        uint256 calculatedInterest,
        bool isLocked,
        uint256 unlockRequestTime
    ) {
        Stake memory stake = is7Days ? stakes7Days[user] : stakes1Year[user];
        uint256 currentRate = is7Days ? rewardRate7Days : rewardRate1Year;
        
        // Fix duration calculation to match calculatePendingRewards
        uint256 duration;
        if (stake.unlockRequestTime > 0) {
            uint256 unlockPeriod = is7Days ? UNLOCK_PERIOD_7DAYS : UNLOCK_PERIOD_1YEAR;
            uint256 unlockCompleteTime = stake.unlockRequestTime + unlockPeriod;
            
            if (block.timestamp >= unlockCompleteTime) {
                duration = unlockCompleteTime - stake.since;
            } else {
                duration = block.timestamp - stake.since;
            }
        } else {
            duration = block.timestamp - stake.since;
        }
                
        uint256 interest = calculatePendingRewards(stake, currentRate);
        
        return (
            stake.amount,
            duration,
            currentRate,
            interest,
            stake.isLocked,
            stake.unlockRequestTime
        );
    }

}

