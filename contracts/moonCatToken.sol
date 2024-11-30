// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

contract MoonCatToken is ERC20, ERC20Permit, ERC20Votes, Pausable, Ownable {
    uint256 public taxRate = 100;  // 1% tax
    address public taxCollector;
    mapping(address => bool) public excludedFromTax;
    
    uint256 public constant MAX_TAX_RATE = 1000; // 10% max tax
    
    event TaxRateUpdated(uint256 oldRate, uint256 newRate);
    event TaxCollectorUpdated(address oldCollector, address newCollector);
    event AddressExcludedFromTax(address indexed account, bool excluded);

    modifier validAddress(address _address) {
        require(_address != address(0), "Invalid address");
        _;
    }

    constructor(
        string memory name, 
        string memory symbol, 
        uint256 initialSupply
    ) ERC20(name, symbol) ERC20Permit(name) Ownable(msg.sender) {
        require(initialSupply > 0, "Initial supply must be positive");
        // Updated this line to use uint208 instead of uint256
        require(initialSupply <= type(uint208).max / (10 ** decimals()), "Initial supply too large");
        
        taxCollector = _msgSender();
        _mint(_msgSender(), initialSupply * (10 ** decimals()));
    }

    function excludeFromTax(address account) external onlyOwner validAddress(account) {
        excludedFromTax[account] = true;
        emit AddressExcludedFromTax(account, true);
    }

    function includeInTax(address account) external onlyOwner validAddress(account) {
        excludedFromTax[account] = false;
        emit AddressExcludedFromTax(account, false);
    }

    function transfer(address recipient, uint256 amount) public virtual override whenNotPaused returns (bool) {
        require(recipient != address(0), "Transfer to zero address");
        require(amount <= balanceOf(_msgSender()), "Insufficient balance");

        if (excludedFromTax[_msgSender()] || excludedFromTax[recipient]) {
            _transfer(_msgSender(), recipient, amount);
        } else {
            uint256 taxAmount = (amount * taxRate) / 10000;
            uint256 amountAfterTax = amount - taxAmount;
            
            _transfer(_msgSender(), recipient, amountAfterTax);
            _transfer(_msgSender(), taxCollector, taxAmount);
        }
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override whenNotPaused returns (bool) {
        if (excludedFromTax[sender] || excludedFromTax[recipient]) {
            return super.transferFrom(sender, recipient, amount);
        } else {
            uint256 taxAmount = (amount * taxRate) / 10000;
            uint256 amountAfterTax = amount - taxAmount;
            
            super.transferFrom(sender, recipient, amountAfterTax);
            super.transferFrom(sender, taxCollector, taxAmount);
            return true;
        }
    }

    function setTaxRate(uint256 newTaxRate) external onlyOwner {
        require(newTaxRate <= MAX_TAX_RATE, "Tax rate too high");
        uint256 oldRate = taxRate;
        taxRate = newTaxRate;
        emit TaxRateUpdated(oldRate, newTaxRate);
    }

    function setTaxCollector(address newCollector) external onlyOwner validAddress(newCollector) {
        address oldCollector = taxCollector;
        taxCollector = newCollector;
        emit TaxCollectorUpdated(oldCollector, newCollector);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Required overrides
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Votes) {
        super._update(from, to, amount);
    }

    // This is how nonces should be overridden in OpenZeppelin 5.1.0
    function nonces(
        address owner
    ) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    // Clock functions required by ERC20Votes
    function clock() public view virtual override returns (uint48) {
        return uint48(block.timestamp);
    }

    function CLOCK_MODE() public pure virtual override returns (string memory) {
        return "mode=timestamp";
    }

    // Get domain separator
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}