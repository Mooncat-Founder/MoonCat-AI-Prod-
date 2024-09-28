// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MoonCatToken is ERC20 {
    uint256 public taxRate = 100;  // 1% tax
    address public taxCollector;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        owner = msg.sender;
        taxCollector = msg.sender;  // Initialize the tax collector
        _mint(msg.sender, initialSupply * (10 ** uint256(decimals())));  // Mint the initial supply
    }

    // Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be the zero address");
        owner = newOwner;
    }

    // Override the transfer function to include tax logic
    function transfer(address recipient, uint256 amount) public override returns (bool) {
        uint256 taxAmount = (amount * taxRate) / 10000;
        uint256 amountAfterTax = amount - taxAmount;

        _transfer(_msgSender(), recipient, amountAfterTax);
        _transfer(_msgSender(), taxCollector, taxAmount);
        return true;
    }

    // Override the transferFrom function to include tax logic
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        uint256 taxAmount = (amount * taxRate) / 10000;
        uint256 amountAfterTax = amount - taxAmount;

        _transfer(sender, recipient, amountAfterTax);
        _transfer(sender, taxCollector, taxAmount);

        uint256 currentAllowance = allowance(sender, _msgSender());
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _approve(sender, _msgSender(), currentAllowance - amount);

        return true;
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
