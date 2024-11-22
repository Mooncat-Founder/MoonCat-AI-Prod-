// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenSaleWithOracle is ReentrancyGuard, Ownable {
    IERC20 public mctToken;
    IERC20 public usdtToken;
    
    address public treasuryWallet;
    uint256 public totalEthRaised;
    uint256 public totalUsdtRaised;
    
    // Price feed replacement
    uint256 public ethPriceUSD;  // ETH/USD price with 6 decimals
    
    // Constants for price calculations
    uint256 public constant TOKEN_PRICE_USD = 5000000; // $0.005 with 6 decimals
    uint256 public constant MIN_PURCHASE_USD = 100000000; // $100 with 6 decimals
    uint256 public constant MAX_PURCHASE_USD = 50000000000; // $50,000 with 6 decimals
    
    event FundsWithdrawn(address indexed token, uint256 amount);
    event EthWithdrawn(uint256 amount);
    event TreasuryWalletUpdated(address indexed newWallet);
    event TokensPurchased(address indexed buyer, uint256 amountUSD, uint256 tokenAmount);
    event EthPriceUpdated(uint256 newPrice);
    
    constructor(
        address _mctToken,
        address _usdtToken,
        address _treasuryWallet,
        uint256 _initialEthPrice
    ) Ownable(msg.sender) {
        mctToken = IERC20(_mctToken);
        usdtToken = IERC20(_usdtToken);
        treasuryWallet = _treasuryWallet;
        ethPriceUSD = _initialEthPrice;
    }
    
    // Admin function to update ETH price
    function updateEthPrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Invalid price");
        ethPriceUSD = _newPrice;
        emit EthPriceUpdated(_newPrice);
    }
    
    function setTreasuryWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        treasuryWallet = _newWallet;
        emit TreasuryWalletUpdated(_newWallet);
    }
    
    function buyWithETH() external payable nonReentrant {
        require(msg.value > 0, "No ETH sent");
        
        uint256 usdValue = (msg.value * ethPriceUSD) / 1e18; // Convert to USDT decimals
        
        require(usdValue >= MIN_PURCHASE_USD, "Below minimum purchase");
        require(usdValue <= MAX_PURCHASE_USD, "Exceeds maximum purchase");
        
        uint256 tokenAmount = calculateTokensForUsd(usdValue);
        totalEthRaised += msg.value;
        
        require(mctToken.transfer(msg.sender, tokenAmount), "Token transfer failed");
        emit TokensPurchased(msg.sender, usdValue, tokenAmount);
    }
    
    function buyWithUSDT(uint256 amount) external nonReentrant {
        require(amount > 0, "No USDT sent");
        require(amount >= MIN_PURCHASE_USD, "Below minimum purchase");
        require(amount <= MAX_PURCHASE_USD, "Exceeds maximum purchase");
        
        require(usdtToken.transferFrom(msg.sender, address(this), amount), 
                "USDT transfer failed");
                
        uint256 tokenAmount = calculateTokensForUsd(amount);
        totalUsdtRaised += amount;
        
        require(mctToken.transfer(msg.sender, tokenAmount), "Token transfer failed");
        emit TokensPurchased(msg.sender, amount, tokenAmount);
    }
    
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool sent, ) = treasuryWallet.call{value: balance}("");
        require(sent, "Failed to send ETH");
        
        emit EthWithdrawn(balance);
    }
    
    function withdrawUSDT() external onlyOwner {
        uint256 balance = usdtToken.balanceOf(address(this));
        require(balance > 0, "No USDT to withdraw");
        
        require(usdtToken.transfer(treasuryWallet, balance), 
                "USDT transfer failed");
                
        emit FundsWithdrawn(address(usdtToken), balance);
    }
    
    function withdrawToken(address token) external onlyOwner {
        require(token != address(mctToken), "Cannot withdraw sale tokens");
        
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        require(tokenContract.transfer(treasuryWallet, balance), 
                "Token transfer failed");
                
        emit FundsWithdrawn(token, balance);
    }
    
    function getTotalRaised() external view returns (uint256 eth, uint256 usdt) {
        return (totalEthRaised, totalUsdtRaised);
    }
    
    function calculateTokensForUsd(uint256 usdAmount) public pure returns (uint256) {
        return (usdAmount * 1e18) / TOKEN_PRICE_USD;
    }
    
    receive() external payable {}
}