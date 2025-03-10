// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title MoonCatStakingTimelock
 * @dev Timelock controller for MoonCat staking contract with 48-hour delay
 */
contract MoonCatStakingTimelock is TimelockController {
    /**
     * @dev Constructor for MoonCatStakingTimelock
     * @param minDelay Minimum delay before operations can be executed (48 hours)
     * @param proposers List of addresses that can propose operations (your multi-sig)
     * @param executors List of addresses that can execute operations (your multi-sig)
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors
    ) TimelockController(minDelay, proposers, executors, address(0)) {
        // address(0) means no admin - the timelock will be self-administered
    }
}

/**
 * @title MoonCatSaleTimelock
 * @dev Timelock controller for MoonCat token sale contract with 48-hour delay
 */
contract MoonCatSaleTimelock is TimelockController {
    /**
     * @dev Constructor for MoonCatSaleTimelock
     * @param minDelay Minimum delay before operations can be executed (48 hours)
     * @param proposers List of addresses that can propose operations (your multi-sig)
     * @param executors List of addresses that can execute operations (your multi-sig)
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors
    ) TimelockController(minDelay, proposers, executors, address(0)) {
        // address(0) means no admin - the timelock will be self-administered
    }
}