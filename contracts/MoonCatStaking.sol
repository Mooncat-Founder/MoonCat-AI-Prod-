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
        uint256 rewardDebt;
    }

    mapping(address => Stake) public stakes7Days;
    mapping(address => Stake) public stakes1Year;
    
    uint256 public rewardRate7Days;
    uint256 public rewardRate1Year;
    
    uint256 public constant UNLOCK_PERIOD_7DAYS = 7 days;
    uint256 public constant UNLOCK_PERIOD_1YEAR = 365 days;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant FORCE_UNLOCK_PENALTY = 5000; // 50% penalty
    uint256 public constant MAX_RATE_7DAYS = 2000;      // 20% APR max
    uint256 public constant MAX_RATE_1YEAR = 3500;      // 35% APR max
    uint256 public constant RATE_CHANGE_COOLDOWN = 7 days;

    bool public emergencyMode;
    uint256 public emergencyWithdrawalFee = 1000; // 10% fee during emergency
    uint256 public lastRateChange;

    event Staked(address indexed user, uint256 amount, uint256 since, string indexed stakeType);
    event UnlockRequested(address indexed user, uint256 unlockRequestTime, string indexed stakeType);
    event Unstaked(address indexed user, uint256 amount, uint256 reward, string indexed stakeType);
    event ForceUnlocked(address indexed user, uint256 amount, uint256 penalty, string indexed stakeType);
    event EmergencyWithdraw(address indexed user, uint256 amount, uint256 fee);
    event RateChanged(string indexed stakeType, uint256 oldRate, uint256 newRate);
    event EmergencyModeEnabled(address indexed by);

    modifier validAddress(address _address) {
        require(_address != address(0), "Invalid address");
        _;
    }

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

    // Staking Functions
    function stake7Days(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Cannot stake 0");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        
        Stake storage userStake = stakes7Days[msg.sender];
        
        if (userStake.amount > 0 && !userStake.isLocked) {
            uint256 reward = calculatePendingRewards(userStake, rewardRate7Days);
            userStake.amount += reward;
        }

        require(token.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        userStake.amount += _amount;
        userStake.since = block.timestamp;
        userStake.isLocked = true;
        userStake.unlockRequestTime = 0;
        
        emit Staked(msg.sender, _amount, block.timestamp, "7-Day");
    }

    function requestUnlock7Days() external whenNotPaused {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.isLocked, "Already unlocking");

        uint256 reward = calculatePendingRewards(userStake, rewardRate7Days);
        userStake.amount += reward;
        userStake.unlockRequestTime = block.timestamp;
        userStake.isLocked = false;

        emit UnlockRequested(msg.sender, block.timestamp, "7-Day");
    }

    function unstake7Days() external nonReentrant whenNotPaused {
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(userStake.unlockRequestTime > 0, "Unlock not requested");
        require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD_7DAYS, "Still locked");

        uint256 amount = userStake.amount;
        delete stakes7Days[msg.sender];
        
        require(token.transfer(msg.sender, amount), "Transfer failed");
        emit Unstaked(msg.sender, amount, 0, "7-Day");
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

    // Rate Management Functions
    function setRewardRate7Days(uint256 _newRate) 
        external 
        onlyRole(GOVERNOR_ROLE) 
        whenNotPaused 
    {
        require(_newRate <= MAX_RATE_7DAYS, "Rate too high");
        
        // Skip cooldown if it's the first rate change or if caller has admin role
        if (lastRateChange != 0 && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            require(block.timestamp >= lastRateChange + RATE_CHANGE_COOLDOWN, "Rate change too soon");
        }
        
        uint256 oldRate = rewardRate7Days;
        rewardRate7Days = _newRate;
        lastRateChange = block.timestamp;
        emit RateChanged("7-Day", oldRate, _newRate);
    }

    function setRewardRate1Year(uint256 _newRate) 
        external 
        onlyRole(GOVERNOR_ROLE) 
        whenNotPaused 
    {
        require(_newRate <= MAX_RATE_1YEAR, "Rate too high");
        
        // Skip cooldown if it's the first rate change or if caller has admin role
        if (lastRateChange != 0 && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            require(block.timestamp >= lastRateChange + RATE_CHANGE_COOLDOWN, "Rate change too soon");
        }
        
        uint256 oldRate = rewardRate1Year;
        rewardRate1Year = _newRate;
        lastRateChange = block.timestamp;
        emit RateChanged("1-Year", oldRate, _newRate);
    }

    // Emergency Functions
    function enableEmergencyMode() external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyMode = true;
        _pause();
        emit EmergencyModeEnabled(msg.sender);
    }

    function emergencyWithdraw() external nonReentrant {
        require(emergencyMode, "Emergency mode not active");
        
        Stake storage userStake = stakes7Days[msg.sender];
        require(userStake.amount > 0, "No stake found");

        uint256 amount = userStake.amount;
        uint256 fee = (amount * emergencyWithdrawalFee) / BASIS_POINTS;
        uint256 withdrawAmount = amount - fee;

        delete stakes7Days[msg.sender];

        require(token.transfer(msg.sender, withdrawAmount), "Transfer failed");
        emit EmergencyWithdraw(msg.sender, withdrawAmount, fee);
    }

    // View Functions
    function calculatePendingRewards(
        Stake memory stake,
        uint256 rate
    ) internal view returns (uint256) {
        if (!stake.isLocked || stake.amount == 0) return 0;
        
        uint256 duration = block.timestamp - stake.since;
        uint256 timeComponent = (duration * rate) / (365 days);
        if (timeComponent > BASIS_POINTS) timeComponent = BASIS_POINTS;
        
        return (stake.amount * timeComponent) / BASIS_POINTS;
    }

    function getPendingRewards7Days(address user) external view returns (uint256) {
        return calculatePendingRewards(stakes7Days[user], rewardRate7Days);
    }

    function checkRoles(address account) external view returns (bool isAdmin, bool isGovernor, bool isPauser) {
        return (
            hasRole(DEFAULT_ADMIN_ROLE, account),
            hasRole(GOVERNOR_ROLE, account),
            hasRole(PAUSER_ROLE, account)
        );
    }

        function getDebugInfo() external view returns (
        bool isPaused,
        bool hasGovernorRole,
        bool hasAdminRole,
        uint256 currentRate7Days,
        uint256 currentRate1Year,
        uint256 lastChangeTime,
        uint256 timeUntilNextChange,
        bool canChangeRate
        ) {
            uint256 nextChangeTime = lastRateChange + RATE_CHANGE_COOLDOWN;
            return (
                paused(),
                hasRole(GOVERNOR_ROLE, msg.sender),
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
                rewardRate7Days,
                rewardRate1Year,
                lastRateChange,
                block.timestamp >= nextChangeTime ? 0 : nextChangeTime - block.timestamp,
                block.timestamp >= nextChangeTime || hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
            );
    }

    // Access Control Functions
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}