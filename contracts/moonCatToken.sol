// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MoonCatToken is ERC1155 {
    uint256 public constant STAKING_TOKEN = 1;  // ID 1 for staking token
    uint256 public constant GOVERNANCE_TOKEN = 2;  // ID 2 for governance token

    uint256 public totalSupplyStaking;
    uint256 public totalSupplyGovernance;

    uint256 public taxRate = 100;  // 1% tax
    address public taxCollector;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    constructor() ERC1155("https://mooncat.ai/metadata/{id}.json") {
        owner = msg.sender;  // Set deployer as the initial owner
        taxCollector = msg.sender;  // Initialize the tax collector
    }

    // Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be the zero address");
        owner = newOwner;
    }

    // Mint Staking Token
    function mintStakingToken(address to, uint256 amount) external onlyOwner {
        totalSupplyStaking += amount;
        _mint(to, STAKING_TOKEN, amount, "");
    }

    // Mint Governance Token (issued when users stake)
    function mintGovernanceToken(address to, uint256 amount) external onlyOwner {
        totalSupplyGovernance += amount;
        _mint(to, GOVERNANCE_TOKEN, amount, "");
    }

    // Override the safeTransferFrom to include tax logic
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override {
        uint256 taxAmount = (amount * taxRate) / 10000;
        uint256 amountAfterTax = amount - taxAmount;

        require(balanceOf(from, id) >= amount, "Insufficient balance");

        // Send tax to taxCollector and remaining amount to recipient
        _safeTransferFrom(from, to, id, amountAfterTax, data);
        _safeTransferFrom(from, taxCollector, id, taxAmount, data);
    }

    // Set tax rate
    function setTaxRate(uint256 newTaxRate) external onlyOwner {
        taxRate = newTaxRate;
    }

    // Set tax collector address
    function setTaxCollector(address newCollector) external onlyOwner {
        taxCollector = newCollector;
    }
}
