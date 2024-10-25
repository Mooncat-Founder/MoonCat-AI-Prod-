// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MoonCatToken is ERC20 {
    uint256 public taxRate = 100;  // 1% tax
    address public taxCollector;
    address public owner;
    mapping(address => bool) public excludedFromTax;  // New: for staking contract

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        owner = msg.sender;
        taxCollector = msg.sender;
        _mint(msg.sender, initialSupply * (10 ** uint256(decimals())));
    }

    // New function to exclude addresses from tax (for staking contract)
    function excludeFromTax(address account) external onlyOwner {
        excludedFromTax[account] = true;
    }

    // New function to include addresses in tax
    function includeInTax(address account) external onlyOwner {
        excludedFromTax[account] = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
    }

    // Updated transfer function with tax exclusion
    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (excludedFromTax[msg.sender] || excludedFromTax[recipient]) {
            _transfer(_msgSender(), recipient, amount);
        } else {
            uint256 taxAmount = (amount * taxRate) / 10000;
            uint256 amountAfterTax = amount - taxAmount;
            _transfer(_msgSender(), recipient, amountAfterTax);
            _transfer(_msgSender(), taxCollector, taxAmount);
        }
        return true;
    }

    // Updated transferFrom function with tax exclusion
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        if (excludedFromTax[sender] || excludedFromTax[recipient]) {
            _transfer(sender, recipient, amount);
        } else {
            uint256 taxAmount = (amount * taxRate) / 10000;
            uint256 amountAfterTax = amount - taxAmount;
            _transfer(sender, recipient, amountAfterTax);
            _transfer(sender, taxCollector, taxAmount);
        }

        uint256 currentAllowance = allowance(sender, _msgSender());
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _approve(sender, _msgSender(), currentAllowance - amount);

        return true;
    }

    function setTaxRate(uint256 newTaxRate) external onlyOwner {
        require(newTaxRate <= 1000, "Tax rate cannot exceed 10%");
        taxRate = newTaxRate;
    }

    function setTaxCollector(address newCollector) external onlyOwner {
        require(newCollector != address(0), "Tax collector cannot be zero address");
        taxCollector = newCollector;
    }
}