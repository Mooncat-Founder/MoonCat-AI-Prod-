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
        uint256 rate;          // Added field for reward rate
        uint256 unlockPeriod;  // Added field for unlock period
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
    uint256 public constant MIN_RATE_7DAYS = 100;  // 1% APR minimum
    uint256 public constant MIN_RATE_1YEAR = 200;  // 2% APR minimum
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
    event EmergencyModeDisabled(address indexed by);
    event StakeCompounded(address indexed user, uint256 originalAmount, uint256 compoundedInterest, uint256 newTotal, string indexed stakeType);
    event RateUpdateOptIn(
        address indexed user,
        string indexed stakeType,
        uint256 oldRate,
        uint256 newRate
    );

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
            uint256 reward = calculatePendingRewards(userStake);
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

        // Set the rate and unlock period only if this is a new stake
        if (userStake.rate == 0) {
            userStake.rate = rewardRate7Days;
            userStake.unlockPeriod = UNLOCK_PERIOD_7DAYS;
        }

        stakingStats7Days[msg.sender].totalStaked += _amount;
        
        emit Staked(msg.sender, _amount, block.timestamp, "7-Day");
    }


    function requestUnlock7Days() external whenNotPaused {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime == 0, "Already unlocking");

        // Compound any pending rewards before starting unlock
        uint256 reward = calculatePendingRewards(userStake);
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
        uint256 reward = calculatePendingRewards(userStake);
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
    function isUnlockComplete(Stake memory stake) public view returns (bool) {
        if (stake.unlockRequestTime == 0) return false;
        uint256 unlockPeriod = stake.unlockPeriod;
        return block.timestamp >= stake.unlockRequestTime + unlockPeriod;
    }


    function forceUnlock7Days() external nonReentrant whenNotPaused {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");

        // Prevent force unlock if unlock period has already passed
        if (userStake.unlockRequestTime > 0) {
            uint256 unlockCompleteTime = userStake.unlockRequestTime + userStake.unlockPeriod;
            require(block.timestamp < unlockCompleteTime, "Unlock period over, use unstake");
        }

        // Calculate pending rewards
        uint256 reward = calculatePendingRewards(userStake);
        uint256 totalAmount = userStake.amount + reward;

        // Update stats
        if (reward > 0) {
            stakingStats7Days[msg.sender].totalWithdrawn += reward;
        }

        // Apply penalty on the total amount (stake + rewards)
        uint256 penalty = (totalAmount * FORCE_UNLOCK_PENALTY) / BASIS_POINTS;
        uint256 amountAfterPenalty = totalAmount - penalty;

        // Clear the user's stake
        delete stakes7Days[msg.sender];

        // Transfer the amount after penalty
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
            uint256 reward = calculatePendingRewards(userStake);
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

        // Set the rate and unlock period only if this is a new stake
        if (userStake.rate == 0) {
            userStake.rate = rewardRate1Year;
            userStake.unlockPeriod = UNLOCK_PERIOD_1YEAR;
        }

        stakingStats1Year[msg.sender].totalStaked += _amount;
        
        emit Staked(msg.sender, _amount, block.timestamp, "1-Year");
    }


     function requestUnlock1Year() external whenNotPaused {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime == 0, "Already unlocking");

        // Compound any pending rewards before starting unlock
        uint256 reward = calculatePendingRewards(userStake);
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

        // Store original amount before deletion
        uint256 originalStakeAmount = userStake.amount;
        
        // Calculate final rewards before unstaking
        uint256 reward = calculatePendingRewards(userStake);
        uint256 totalAmount = originalStakeAmount + reward;
        
        if (reward > 0) {
            stakingStats1Year[msg.sender].totalWithdrawn += reward;
        }

        delete stakes1Year[msg.sender];
        
        require(token.transfer(msg.sender, totalAmount), "Transfer failed");
        emit Unstaked(msg.sender, originalStakeAmount, reward, "1-Year");
    }

    function forceUnlock1Year() external nonReentrant whenNotPaused {
        Stake storage userStake = stakes1Year[msg.sender];
        require(userStake.amount > 0, "No stake found");

        // Prevent force unlock if unlock period has already passed
        if (userStake.unlockRequestTime > 0) {
            uint256 unlockCompleteTime = userStake.unlockRequestTime + userStake.unlockPeriod;
            require(block.timestamp < unlockCompleteTime, "Unlock period over, use unstake");
        }

        // Calculate pending rewards using the stake's specific rate
        uint256 reward = calculatePendingRewards(userStake);
        uint256 totalAmount = userStake.amount + reward;

        // Update stats
        if (reward > 0) {
            stakingStats1Year[msg.sender].totalWithdrawn += reward;
        }

        // Apply penalty on the total amount (stake + rewards)
        uint256 penalty = (totalAmount * FORCE_UNLOCK_PENALTY) / BASIS_POINTS;
        uint256 amountAfterPenalty = totalAmount - penalty;

        // Clear the user's stake
        delete stakes1Year[msg.sender];

        // Transfer the amount after penalty
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

        uint256 reward = calculatePendingRewards(userStake);
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

        uint256 reward = calculatePendingRewards(userStake);
        if (reward > 0) {
            userStake.since = block.timestamp;
            stakingStats1Year[user].totalWithdrawn += reward;
        }
        return reward;
    }

    function setRewardRate7Days(uint256 _newRate) external onlyRole(GOVERNOR_ROLE) whenNotPaused {
        require(_newRate <= MAX_RATE_7DAYS, "Rate too high");
        require(_newRate >= MIN_RATE_7DAYS, "Rate too low");  // Added line
        
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
        require(_newRate >= MIN_RATE_1YEAR, "Rate too low");  // Added line
        
        if (lastRateChange != 0 && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            require(block.timestamp >= lastRateChange + RATE_CHANGE_COOLDOWN, "Rate change too soon");
        }
        
        uint256 oldRate = rewardRate1Year;
        rewardRate1Year = _newRate;
        lastRateChange = block.timestamp;
        emit RateChanged("1-Year", oldRate, _newRate);
    }

    function enableEmergencyMode() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!emergencyMode, "Emergency mode already active");
        emergencyMode = true;
        _pause();
        emit EmergencyModeEnabled(msg.sender);
    }

        function disableEmergencyMode() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(emergencyMode, "Emergency mode not active");
        emergencyMode = false;
        emit EmergencyModeDisabled(msg.sender);
        // Note: This doesn't automatically unpause the contract
        // The admin still needs to call unpause() separately if desired
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
        emit EmergencyWithdraw(msg.sender, totalAmount, 0);
    }

    // View Functions
    function calculatePendingRewards(Stake memory stake) public view returns (uint256) {
        if (stake.amount == 0 || !stake.isLocked) {
            return 0;
        }

        uint256 rate = stake.rate;
        uint256 unlockPeriod = stake.unlockPeriod;

        // Calculate the duration in seconds
        uint256 stakeDuration;
        if (stake.unlockRequestTime > 0) {
            uint256 unlockCompleteTime = stake.unlockRequestTime + unlockPeriod;

            if (block.timestamp >= unlockCompleteTime) {
                // If unlock period is complete
                if (stake.since >= unlockCompleteTime) {
                    // No duration; stake.since is after unlock completion
                    stakeDuration = 0;
                } else {
                    // Calculate interest up to unlock completion
                    stakeDuration = unlockCompleteTime - stake.since;
                }
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
        uint256 timeStaked,
        uint256 rate // Added to return the rate
    ) {
        Stake memory stake = stakes7Days[user];
        return (
            stake.amount,
            calculatePendingRewards(stake),
            stake.isLocked,
            stake.unlockRequestTime,
            stake.since,
            stake.rate
        );
    }


    function getStakeDetails1Year(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        bool isLocked,
        uint256 unlockRequestTime,
        uint256 timeStaked,
        uint256 rate // Added to return the rate
    ) {
        Stake memory stake = stakes1Year[user];
        return (
            stake.amount,
            calculatePendingRewards(stake),
            stake.isLocked,
            stake.unlockRequestTime,
            stake.since,
            stake.rate
        );
    }

    function getAllStakingStats(address user) external view returns (
        StakingStats memory stats7Days,
        StakingStats memory stats1Year
    ) {
        // Retrieve the user's staking stats for both staking periods
        stats7Days = stakingStats7Days[user];
        stats1Year = stakingStats1Year[user];
        
        // Retrieve the user's stakes
        Stake memory stake7 = stakes7Days[user];
        Stake memory stake1 = stakes1Year[user];
        
        // Calculate and update the current pending rewards using the updated calculatePendingRewards function
        stats7Days.currentPendingRewards = calculatePendingRewards(stake7);
        stats1Year.currentPendingRewards = calculatePendingRewards(stake1);
        
        // Return the updated staking stats
        return (stats7Days, stats1Year);
    }


  // Add a view function to get time until unlock completion
    function getTimeUntilUnlock(address user, bool is7Days) external view returns (uint256) {
        Stake memory stake = is7Days ? stakes7Days[user] : stakes1Year[user];
        if (stake.unlockRequestTime == 0) return 0;
        
        uint256 unlockTime = stake.unlockRequestTime + stake.unlockPeriod;
        
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
        
        uint256 duration;
        if (stake.unlockRequestTime > 0) {
            uint256 unlockCompleteTime = stake.unlockRequestTime + stake.unlockPeriod;
            
            if (block.timestamp >= unlockCompleteTime) {
                duration = unlockCompleteTime - stake.since;
            } else {
                duration = block.timestamp - stake.since;
            }
        } else {
            duration = block.timestamp - stake.since;
        }
                
        uint256 interest = calculatePendingRewards(stake);
        
        return (
            stake.amount,
            duration,
            stake.rate,
            interest,
            stake.isLocked,
            stake.unlockRequestTime
        );
    }

    function optInToNewRate(bool is7DayStake) external whenNotPaused {
        require(!emergencyMode, "Emergency mode active");

        if (is7DayStake) {
            Stake storage userStake = stakes7Days[msg.sender];
            require(userStake.amount > 0, "No stake found");
            require(userStake.isLocked, "Stake not locked");
            require(userStake.unlockRequestTime == 0, "Cannot opt-in during unlock");
            require(userStake.rate < rewardRate7Days, "Current rate not lower");
            
            // Calculate and add pending rewards at old rate
            uint256 pendingRewards = calculatePendingRewards(userStake);
            uint256 originalAmount = userStake.amount;
            
            if (pendingRewards > 0) {
                userStake.amount += pendingRewards;
                stakingStats7Days[msg.sender].totalCompounded += pendingRewards;
                emit StakeCompounded(msg.sender, originalAmount, pendingRewards, userStake.amount, "7-Day");
            }
            
            // Update to new rate
            uint256 oldRate = userStake.rate;
            userStake.rate = rewardRate7Days;
            userStake.since = block.timestamp;
            
            emit RateUpdateOptIn(msg.sender, "7-Day", oldRate, rewardRate7Days);
        } else {
            Stake storage userStake = stakes1Year[msg.sender];
            require(userStake.amount > 0, "No stake found");
            require(userStake.isLocked, "Stake not locked");
            require(userStake.unlockRequestTime == 0, "Cannot opt-in during unlock");
            require(userStake.rate < rewardRate1Year, "Current rate not lower");
            
            // Calculate and add pending rewards at old rate
            uint256 pendingRewards = calculatePendingRewards(userStake);
            uint256 originalAmount = userStake.amount;
            
            if (pendingRewards > 0) {
                userStake.amount += pendingRewards;
                stakingStats1Year[msg.sender].totalCompounded += pendingRewards;
                emit StakeCompounded(msg.sender, originalAmount, pendingRewards, userStake.amount, "1-Year");
            }
            
            // Update to new rate
            uint256 oldRate = userStake.rate;
            userStake.rate = rewardRate1Year;
            userStake.since = block.timestamp;
            
            emit RateUpdateOptIn(msg.sender, "1-Year", oldRate, rewardRate1Year);
        }
    }

        function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

}

