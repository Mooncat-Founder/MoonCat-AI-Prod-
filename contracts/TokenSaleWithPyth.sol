// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract TokenSaleWithPyth is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    IERC20 public mctToken;
    IERC20 public usdtToken;
    IPyth public pyth;
    bytes32 public constant ETH_USD_PRICE_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
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

    // New price update related state variables
    uint256 private priceUpdateBalance;
    uint256 public lastPriceTimestamp;
    uint256 public cachedEthPrice;

    // Constants for price calculations
    uint256 public constant TOKEN_PRICE_USD = 5000000; // $0.005 with 6 decimals
    uint256 public constant MIN_PURCHASE_USD = 100000000; // $100 with 6 decimals
    uint256 public constant MAX_PURCHASE_USD = 50000000000; // $50,000 with 6 decimals
    uint256 public constant PRICE_FRESHNESS_THRESHOLD = 120; // 120 seconds staleness threshold

    // Add new events for price updates
    event PriceUpdatesFunded(uint256 amount, uint256 newBalance);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice, uint256 timestamp);
    event FundsWithdrawn(address indexed token, uint256 amount);
    event EthWithdrawn(uint256 amount);
    event TreasuryWalletUpdated(address indexed newWallet);
    event TokensPurchased(address indexed buyer, uint256 amountUSD, uint256 tokenAmount);
    event EmergencyModeEnabled();
    event EmergencyModeDisabled();
    event EmergencyWithdraw(address indexed user, uint256 ethAmount, uint256 usdtAmount);
    event SaleFinalized();
    event TokensWithdrawn(address indexed user, uint256 amount);
    event ContractPaused(address indexed owner);
    event ContractUnpaused(address indexed owner);

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

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // New function to fund price updates
    function fundPriceUpdates() external payable onlyOwner {
        priceUpdateBalance += msg.value;
        emit PriceUpdatesFunded(msg.value, priceUpdateBalance);
    }

    // Modified to handle price updates
    function updateEthPrice(bytes[] calldata priceUpdate) public returns (uint256) {
        require(priceUpdateBalance > 0, "Contract needs funds for price updates");
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        require(priceUpdateBalance >= fee, "Insufficient update funds");

        uint256 oldPrice = cachedEthPrice;
        pyth.updatePriceFeeds{value: fee}(priceUpdate);
        priceUpdateBalance -= fee;

        PythStructs.Price memory price = pyth.getPriceNoOlderThan(
            ETH_USD_PRICE_ID,
            PRICE_FRESHNESS_THRESHOLD
        );

        require(price.price > 0, "Invalid price feed: negative or zero value");
        require(uint64(price.conf) <= uint64(price.price) / 100, "Price confidence interval too large");
        require(price.expo == -8, "Unexpected price feed decimals");

        uint256 newPrice = uint256(uint64(price.price)) / 100;
        cachedEthPrice = newPrice;
        lastPriceTimestamp = block.timestamp;

        emit PriceUpdated(oldPrice, newPrice, block.timestamp);
        return newPrice;
    }

    // Modified to use cached price with freshness check
    function getEthPrice() public view returns (uint256) {
        require(cachedEthPrice > 0, "Price not initialized");
        require(block.timestamp - lastPriceTimestamp <= PRICE_FRESHNESS_THRESHOLD, "Price too old");
        return cachedEthPrice;
    }

    // Modified buyWithETH to use the new price mechanism
    function buyWithETH() public payable nonReentrant whenNotPaused {
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

    // Rest of your existing functions remain unchanged
    function buyWithUSDT(uint256 amount) external nonReentrant whenNotPaused {
        require(!emergencyMode, "Emergency mode: purchases disabled");
        require(amount > 0, "No USDT sent");
        require(!saleFinalized, "Sale is finished");
        require(amount >= MIN_PURCHASE_USD, "Below minimum purchase");
        require(amount <= MAX_PURCHASE_USD, "Exceeds maximum purchase");
        
        uint256 tokenAmount = calculateTokensForUsd(amount);
        require(tokenAmount <= remainingTokens, "Not enough tokens remaining");
        
        usdtToken.safeTransferFrom(msg.sender, address(this), amount);
                
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

    // Add function to withdraw unused price update funds
    function withdrawPriceUpdateFunds() external onlyOwner {
        uint256 amount = priceUpdateBalance;
        require(amount > 0, "No funds to withdraw");
        priceUpdateBalance = 0;
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Transfer failed");
    }

    // Existing functions remain unchanged...
    function setTreasuryWallet(address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "Invalid address");
        treasuryWallet = _newWallet;
        emit TreasuryWalletUpdated(_newWallet);
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
        mctToken.safeTransfer(msg.sender, amount);
        emit TokensWithdrawn(msg.sender, amount);
    }

    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance - priceUpdateBalance; // Don't withdraw price update funds
        require(balance > 0, "No ETH to withdraw");
        
        (bool sent, ) = treasuryWallet.call{value: balance}("");
        require(sent, "Failed to send ETH");
        
        emit EthWithdrawn(balance);
    }
    
    function withdrawUSDT() external onlyOwner {
        uint256 balance = usdtToken.balanceOf(address(this));
        require(balance > 0, "No USDT to withdraw");
        
        usdtToken.safeTransfer(treasuryWallet, balance);
        emit FundsWithdrawn(address(usdtToken), balance);
    }
    
    function withdrawToken(address token) external onlyOwner {
        require(token != address(mctToken), "Cannot withdraw sale tokens");
        require(!emergencyMode, "Emergency mode active: use emergencyWithdraw");
        
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        tokenContract.safeTransfer(treasuryWallet, balance);
        emit FundsWithdrawn(token, balance);
    }
    
    function getTotalRaised() external view returns (uint256 eth, uint256 usdt) {
        return (totalEthRaised, totalUsdtRaised);
    }
    
    function calculateTokensForUsd(uint256 usdAmount) public pure returns (uint256) {
        return (usdAmount * 1e18 * 1000) / TOKEN_PRICE_USD;
    }

    function getTokenBalance(address user) external view returns (uint256) {
        return pendingTokens[user];
    }

    function getUserContributions(address user) external view returns (uint256 eth, uint256 usdt) {
        return (ethContributions[user], usdtContributions[user]);
    }

    function pause() external onlyOwner {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    function enableEmergencyMode() external onlyOwner {
        emergencyMode = true;
        emit EmergencyModeEnabled();
    }

    function disableEmergencyMode() external onlyOwner {
        emergencyMode = false;
        emit EmergencyModeDisabled();
    }

    function emergencyWithdraw() external nonReentrant {
        require(emergencyMode, "Emergency mode not active");
        
        uint256 ethAmount = ethContributions[msg.sender];
        uint256 usdtAmount = usdtContributions[msg.sender];
        
        ethContributions[msg.sender] = 0;
        usdtContributions[msg.sender] = 0;
        pendingTokens[msg.sender] = 0;
        
        if (ethAmount > 0) {
            (bool sent, ) = msg.sender.call{value: ethAmount}("");
            require(sent, "Failed to send ETH");
        }
        
        if (usdtAmount > 0) {
            usdtToken.safeTransfer(msg.sender, usdtAmount);
        }
        
        emit EmergencyWithdraw(msg.sender, ethAmount, usdtAmount);
    }

    receive() external payable {
        buyWithETH();
    }

}