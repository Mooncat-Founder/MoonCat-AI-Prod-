// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract TokenSaleWithPyth is ReentrancyGuard, Ownable {
    IERC20 public mctToken;
    IERC20 public usdtToken;
    IPyth public pyth;
    bytes32 public constant ETH_USD_PRICE_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace; // Pyth ETH/USD price feed ID
    address public treasuryWallet;
    uint256 public totalEthRaised;
    uint256 public totalUsdtRaised;
    bool public saleFinalized = false;
    bool public emergencyMode;
    mapping(address => uint256) public ethContributions;
    mapping(address => uint256) public usdtContributions;
    mapping(address => uint256) public pendingTokens;
    uint256 public remainingTokens;
    bool public paused;


    // Constants for price calculations
    uint256 public constant TOKEN_PRICE_USD = 5000000; // $0.005 with 6 decimals
    uint256 public constant MIN_PURCHASE_USD = 100000000; // $100 with 6 decimals
    uint256 public constant MAX_PURCHASE_USD = 50000000000; // $50,000 with 6 decimals
    
    event FundsWithdrawn(address indexed token, uint256 amount);
    event EthWithdrawn(uint256 amount);
    event TreasuryWalletUpdated(address indexed newWallet);
    event TokensPurchased(address indexed buyer, uint256 amountUSD, uint256 tokenAmount);
    event EmergencyModeEnabled();
    event EmergencyModeDisabled();
    event EmergencyWithdraw(address indexed user, uint256 ethAmount, uint256 usdtAmount);
    event SaleFinalized();
    event TokensWithdrawn(address indexed user, uint256 amount);
    
     constructor(
        address _mctToken,
        address _usdtToken,
        address _treasuryWallet,
        address _pythAddress
    ) Ownable(msg.sender) {
        require(_mctToken != address(0), "MCT: zero address");
        require(_usdtToken != address(0), "USDT: zero address");
        require(_treasuryWallet != address(0), "Treasury: zero address");
        require(_pythAddress != address(0), "Pyth: zero address");
        mctToken = IERC20(_mctToken);
        usdtToken = IERC20(_usdtToken);
        treasuryWallet = _treasuryWallet;
        pyth = IPyth(_pythAddress);
        remainingTokens = mctToken.balanceOf(address(this));
    }
    
    function getEthPrice() public view returns (uint256) {
        PythStructs.Price memory price = pyth.getPriceUnsafe(ETH_USD_PRICE_ID);
        // Convert price to positive value if negative
        int64 priceValue = price.price < 0 ? -price.price : price.price;
        // Convert to uint256 and adjust decimals from Pyth's to USDT's 6 decimals
        // Pyth uses 8 decimals for price feeds
        return uint256(uint64(priceValue)) / 100;
    }
    
    function setTreasuryWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        treasuryWallet = _newWallet;
        emit TreasuryWalletUpdated(_newWallet);
    }
    
    function buyWithETH() external payable nonReentrant whenNotPaused {
        require(!emergencyMode, "Emergency mode: purchases disabled");
        require(msg.value > 0, "No ETH sent");
        require(!saleFinalized, "Sale is finished");
        
        uint256 ethPrice = getEthPrice();
        uint256 usdValue = (msg.value * ethPrice) / 1e18;
        
        require(usdValue >= MIN_PURCHASE_USD, "Below minimum purchase");
        require(usdValue <= MAX_PURCHASE_USD, "Exceeds maximum purchase");
        
        uint256 tokenAmount = calculateTokensForUsd(usdValue);
        require(tokenAmount <= remainingTokens, "Not enough tokens remaining");
        
        remainingTokens -= tokenAmount;
        totalEthRaised += msg.value;
        ethContributions[msg.sender] += msg.value;
        
        pendingTokens[msg.sender] += tokenAmount;
        emit TokensPurchased(msg.sender, usdValue, tokenAmount);
        
        if (remainingTokens == 0) {
            saleFinalized = true;
            emit SaleFinalized();
        }
    }
    
    function buyWithUSDT(uint256 amount) external nonReentrant whenNotPaused {
        require(!emergencyMode, "Emergency mode: purchases disabled");
        require(amount > 0, "No USDT sent");
        require(!saleFinalized, "Sale is finished");
        require(amount >= MIN_PURCHASE_USD, "Below minimum purchase");
        require(amount <= MAX_PURCHASE_USD, "Exceeds maximum purchase");
        
        uint256 tokenAmount = calculateTokensForUsd(amount);
        require(tokenAmount <= remainingTokens, "Not enough tokens remaining");
        
        require(usdtToken.transferFrom(msg.sender, address(this), amount), 
                "USDT transfer failed");
                
        remainingTokens -= tokenAmount;
        totalUsdtRaised += amount;
        usdtContributions[msg.sender] += amount;
        
        pendingTokens[msg.sender] += tokenAmount;
        emit TokensPurchased(msg.sender, amount, tokenAmount);
        
        if (remainingTokens == 0) {
            saleFinalized = true;
            emit SaleFinalized();
        }
    }
   
    function finalizeSale() external onlyOwner {
        saleFinalized = true;
        emit SaleFinalized();
    }
    
    function withdrawTokens() external nonReentrant {
        require(saleFinalized, "Sale not finalized yet");
        uint256 amount = pendingTokens[msg.sender];
        require(amount > 0, "No tokens to withdraw");
        
        pendingTokens[msg.sender] = 0;
        
        // Transfer tokens
        require(mctToken.transfer(msg.sender, amount), "Token transfer failed");
        emit TokensWithdrawn(msg.sender, amount);
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
    // usdAmount is in USDT decimals (6)
    // TOKEN_PRICE_USD is 5000000 ($0.005 with 6 decimals)
    // We want to return tokens with 18 decimals
    // Formula: (usdAmount * 1e18) / (TOKEN_PRICE_USD / 1000)
    return (usdAmount * 1e18 * 1000) / TOKEN_PRICE_USD;
}

    function getTokenBalance(address user) external view returns (uint256) {
        return pendingTokens[user];
    }

    function getUserContributions(address user) external view returns (uint256 eth, uint256 usdt) {
        return (ethContributions[user], usdtContributions[user]);
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    function enableEmergencyMode() external onlyOwner {
        emergencyMode = true;
        saleFinalized = true; // Prevent new purchases
        emit EmergencyModeEnabled();
    }

    function disableEmergencyMode() external onlyOwner {
    emergencyMode = false;
    emit EmergencyModeDisabled();
    }

    function emergencyWithdraw() external nonReentrant {
        require(emergencyMode, "Emergency mode not active");
        
        // Refund ETH
        uint256 ethAmount = ethContributions[msg.sender];
        if (ethAmount > 0) {
            ethContributions[msg.sender] = 0;
            (bool sent, ) = msg.sender.call{value: ethAmount}("");
            require(sent, "Failed to send ETH");
        }
        
        // Refund USDT
        uint256 usdtAmount = usdtContributions[msg.sender];
        if (usdtAmount > 0) {
            usdtContributions[msg.sender] = 0;
            require(usdtToken.transfer(msg.sender, usdtAmount), 
                    "USDT transfer failed");
        }
        
        // Clear pending tokens
        pendingTokens[msg.sender] = 0;
        
        emit EmergencyWithdraw(msg.sender, ethAmount, usdtAmount);
    }

    receive() external payable {}
}