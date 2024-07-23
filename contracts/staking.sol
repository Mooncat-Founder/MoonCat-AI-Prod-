// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "./moontesttoken.sol";

contract Staking {
    MoontestToken public token;

    struct Stake {
        uint256 amount;
        uint256 since;
        uint256 unlockRequestTime;
    }

    mapping(address => Stake) public stakes;
    uint256 public rewardRate;

    uint256 public constant UNLOCK_PERIOD = 7 days;

    event Staked(address indexed user, uint256 amount, uint256 since);
    event UnlockRequested(address indexed user, uint256 unlockRequestTime);
    event Unstaked(address indexed user, uint256 amount, uint256 reward);

    constructor(MoontestToken _token) {
        token = _token;
        rewardRate = 9.512E12;
    }

    function stake(uint256 _amount) public {
        require(_amount > 0, "Cannot stake 0");
        require(token.transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        stakes[msg.sender] = Stake(_amount, block.timestamp, 0);
        emit Staked(msg.sender, _amount, block.timestamp);
    }

    function requestUnlock() public {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No stake found");

        userStake.unlockRequestTime = block.timestamp;
        emit UnlockRequested(msg.sender, userStake.unlockRequestTime);
    }

    function unstake() public {
        Stake memory userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(block.timestamp >= userStake.unlockRequestTime + UNLOCK_PERIOD, "Unlock period not reached");

        uint256 reward = (block.timestamp - userStake.since) * rewardRate * userStake.amount / 1e18;
        require(token.transfer(msg.sender, userStake.amount + reward), "Transfer failed");

        delete stakes[msg.sender];
        emit Unstaked(msg.sender, userStake.amount, reward);
    }
}
