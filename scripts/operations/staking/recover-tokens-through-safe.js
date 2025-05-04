// scripts/recover-tokens-through-safe.js
const hre = require("hardhat");
const path = require('path');
require('dotenv').config();
const readline = require('readline');

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt user for input
const prompt = (query) => new Promise((resolve) => rl.question(query, resolve));

// Extended Safe ABI
const SAFE_ABI = [
  "function nonce() public view returns (uint256)",
  "function getThreshold() public view returns (uint256)",
  "function domainSeparator() public view returns (bytes32)",
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes memory signatures) public payable returns (bool success)"
];

// ERC20 ABI for token operations
const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

async function generateSignature(signer, safeTx, domainSeparator) {
  const { ethers } = hre;
  
  // Create the SAFE_TX_TYPEHASH
  const SAFE_TX_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)')
  );

  // Encode the data according to the Safe's rules
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'address', 'uint256', 'bytes32', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
    [
      SAFE_TX_TYPEHASH,
      safeTx.to,
      safeTx.value,
      ethers.keccak256(safeTx.data),
      safeTx.operation,
      safeTx.safeTxGas,
      safeTx.baseGas,
      safeTx.gasPrice,
      safeTx.gasToken,
      safeTx.refundReceiver,
      safeTx.nonce
    ]
  );

  // Calculate the hash to sign
  const encodedTransactionData = ethers.keccak256(encodedData);
  const finalHash = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes('\x19\x01'),
      domainSeparator,
      encodedTransactionData
    ])
  );

  // Sign with ethers signMessage (v6 style)
  const signature = await signer.signMessage(ethers.getBytes(finalHash));
  const sig = ethers.Signature.from(signature);

  // Convert to Safe signature format
  return {
    signer: signer.address,
    data: ethers.hexlify(
      ethers.concat([
        sig.r,
        sig.s,
        ethers.toBeHex(sig.v + 4) // Safe signature type
      ])
    )
  };
}

async function main() {
  try {
    // Get ethers from hardhat
    const { ethers } = hre;
    
    // Determine network
    const network = hre.network.name;
    console.log(`Running on network: ${network}`);
    console.log("Starting token recovery process through Safe...");
    
    // Load keys file based on network
    const keysFile = network.includes("mainnet") ? "keys.prod.json" : "keys.test.json";
    let safeConfig;
    
    try {
      safeConfig = require(path.join(process.cwd(), keysFile));
      console.log(`Loaded keys from ${keysFile}`);
    } catch (error) {
      console.error(`Error loading keys from ${keysFile}: ${error.message}`);
      console.log(`Make sure ${keysFile} exists in the project root directory.`);
      rl.close();
      process.exit(1);
    }
    
    // Get addresses from environment based on network
    let safeAddress, stakingContractAddress, mctTokenAddress, usdtTokenAddress;
    
    if (network.includes("mainnet")) {
      safeAddress = process.env["UNICHAIN-MAINNET_MOONCAT_STAKING_SAFE"];
      stakingContractAddress = process.env["UNICHAIN-MAINNET_STAKING_ADDRESS"];
      mctTokenAddress = process.env["UNICHAIN-MAINNET_MCT_ADDRESS"];
      usdtTokenAddress = process.env["UNICHAIN-MAINNET_USDT_ADDRESS"];
    } else {
      safeAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_MOONCAT_STAKING_SAFE"];
      stakingContractAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_STAKING_ADDRESS"];
      mctTokenAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_MCT_ADDRESS"];
      usdtTokenAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_USDT_ADDRESS"];
    }
    
    // Check if we have all the required addresses
    if (!safeAddress || !stakingContractAddress) {
      throw new Error(`Missing environment variables for ${network}:\n` + 
        `${!safeAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_MOONCAT_STAKING_SAFE" : "UNICHAIN-SEPOLIA-TESTNET_MOONCAT_STAKING_SAFE") + "\n" : ""}` +
        `${!stakingContractAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_STAKING_ADDRESS" : "UNICHAIN-SEPOLIA-TESTNET_STAKING_ADDRESS") : ""}`
      );
    }
    
    console.log('Safe Address:', safeAddress);
    console.log('Staking Contract Address:', stakingContractAddress);
    
    // Check if safeConfig has proper structure
    if (!safeConfig || !safeConfig.signers || !Array.isArray(safeConfig.signers)) {
      console.error(`Invalid keys file format. The file should contain a 'signers' array with private keys.`);
      rl.close();
      process.exit(1);
    }
    
    const provider = ethers.provider;
    
    // Create wallet instances from private keys
    const signers = safeConfig.signers.map(key => 
      new ethers.Wallet(key, provider)
    );
    
    console.log(`Loaded ${signers.length} signers`);
    console.log('Signer addresses:');
    for (let i = 0; i < signers.length; i++) {
      console.log(`Signer ${i + 1}: ${signers[i].address}`);
    }
    
    // Check if we have enough signers
    if (signers.length === 0) {
      console.error("No signers found in the keys file.");
      rl.close();
      process.exit(1);
    }
    
    // Connect to Safe contract
    const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    
    // Get Safe info
    const nonce = await safeContract.nonce();
    const threshold = await safeContract.getThreshold();
    const domainSeparator = await safeContract.domainSeparator();
    
    console.log('\nSafe info:');
    console.log(`Nonce: ${nonce}`);
    console.log(`Threshold: ${threshold} of ${signers.length} signers`);
    
    // Token Recovery Options
    console.log('\nToken Recovery Options:');
    if (mctTokenAddress) console.log(`1: MCT Token (${mctTokenAddress})`);
    if (usdtTokenAddress) console.log(`2: USDT Token (${usdtTokenAddress})`);
    console.log('3: Custom token address');
    
    const tokenChoice = await prompt('Enter choice (1, 2, or 3): ');
    
    let tokenAddress;
    
    switch(tokenChoice) {
      case '1':
        if (!mctTokenAddress) {
          throw new Error('MCT token address not found in environment variables');
        }
        tokenAddress = mctTokenAddress;
        console.log(`Using MCT token address: ${tokenAddress}`);
        break;
      case '2':
        if (!usdtTokenAddress) {
          throw new Error('USDT token address not found in environment variables');
        }
        tokenAddress = usdtTokenAddress;
        console.log(`Using USDT token address: ${tokenAddress}`);
        break;
      case '3':
        tokenAddress = await prompt('Enter token contract address: ');
        if (!ethers.isAddress(tokenAddress)) {
          throw new Error('Invalid token address format');
        }
        break;
      default:
        throw new Error('Invalid token choice');
    }
    
    // Connect to the token contract
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    // Get token info
    let tokenName, tokenSymbol, tokenDecimals;
    try {
      tokenName = await tokenContract.name();
      tokenSymbol = await tokenContract.symbol();
      tokenDecimals = await tokenContract.decimals();
      
      console.log(`\nToken info: ${tokenName} (${tokenSymbol})`);
      console.log(`Decimals: ${tokenDecimals}`);
    } catch (error) {
      console.warn('Could not retrieve full token info. This might not be a standard ERC20 token.');
    }
    
    // Check token balance in the staking contract
    const tokenBalance = await tokenContract.balanceOf(stakingContractAddress);
    
    if (tokenBalance === 0n) {
      console.log(`\nWarning: The staking contract (${stakingContractAddress}) has zero balance of this token.`);
      const confirmZeroBalance = await prompt('Continue anyway? (y/n): ');
      if (confirmZeroBalance.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        process.exit(0);
      }
    } else {
      console.log(`\nStaking contract has ${ethers.formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}`);
    }
    
    // Ask for recipient address
    let recipientAddress = await prompt('\nEnter recipient address for recovered tokens: ');
    
    if (!ethers.isAddress(recipientAddress)) {
      throw new Error('Invalid recipient address format');
    }
    
    // Confirm the recovery amount
    console.log('\nToken Recovery Options:');
    console.log('1: Recover all tokens');
    console.log('2: Specify amount to recover');
    
    const amountChoice = await prompt('Enter choice (1 or 2): ');
    
    let recoveryAmount;
    
    if (amountChoice === '1') {
      recoveryAmount = tokenBalance;
      console.log(`Will recover all tokens: ${ethers.formatUnits(recoveryAmount, tokenDecimals)} ${tokenSymbol}`);
    } else if (amountChoice === '2') {
      const amount = await prompt(`Enter amount in ${tokenSymbol} to recover: `);
      recoveryAmount = ethers.parseUnits(amount, tokenDecimals);
      
      if (recoveryAmount > tokenBalance) {
        console.log(`\nWarning: Requested amount (${ethers.formatUnits(recoveryAmount, tokenDecimals)} ${tokenSymbol}) is greater than available balance (${ethers.formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}).`);
        const confirmExceed = await prompt('Continue anyway? (y/n): ');
        if (confirmExceed.toLowerCase() !== 'y') {
          console.log('Operation cancelled.');
          rl.close();
          process.exit(0);
        }
      }
    } else {
      throw new Error('Invalid amount choice');
    }
    
    // Confirm the operation
    console.log(`\nYou're about to recover ${ethers.formatUnits(recoveryAmount, tokenDecimals)} ${tokenSymbol} from ${stakingContractAddress} to ${recipientAddress}`);
    const confirmOperation = await prompt('Confirm this action? (y/n): ');
    
    if (confirmOperation.toLowerCase() !== 'y') {
      console.log('Operation cancelled.');
      rl.close();
      process.exit(0);
    }
    
    // Create the function call to transfer tokens
    const tokenInterface = new ethers.Interface(ERC20_ABI);
    const callData = tokenInterface.encodeFunctionData("transfer", [recipientAddress, recoveryAmount]);
    
    // Create the transaction object through the Safe
    const safeTx = {
      to: tokenAddress, // Target the token contract
      value: ethers.parseEther("0"),
      data: callData, // Call transfer function
      operation: 0, // Call
      safeTxGas: ethers.parseEther("0"),
      baseGas: ethers.parseEther("0"),
      gasPrice: ethers.parseEther("0"),
      gasToken: ethers.ZeroAddress,
      refundReceiver: ethers.ZeroAddress,
      nonce: nonce
    };
    
    console.log('Collecting signatures for execution...');
    // Collect signatures from owners
    let signatures = [];
    const thresholdValue = typeof threshold.toNumber === 'function' ? threshold.toNumber() : Number(threshold);
    for (let i = 0; i < thresholdValue; i++) {
      console.log(`Getting signature from signer ${i + 1}...`);
      const signature = await generateSignature(signers[i], safeTx, domainSeparator);
      signatures.push(signature);
    }
    
    // Sort signatures by signer address
    signatures.sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
    const signatureBytes = "0x" + signatures.map(sig => sig.data.slice(2)).join("");
    
    console.log('Executing token recovery through Safe...');
    const tx = await safeContract.connect(signers[0]).execTransaction(
      safeTx.to,
      safeTx.value,
      safeTx.data,
      safeTx.operation,
      safeTx.safeTxGas,
      safeTx.baseGas,
      safeTx.gasPrice,
      safeTx.gasToken,
      safeTx.refundReceiver,
      signatureBytes,
      { 
        gasLimit: 500000,
        maxFeePerGas: ethers.parseUnits("20", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
      }
    );
    
    console.log('Waiting for transaction confirmation...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`Token recovery executed successfully!`);
      console.log('Transaction hash:', receipt.hash);
      
      // Verify the new balance after recovery
      const newBalance = await tokenContract.balanceOf(stakingContractAddress);
      const recipientBalance = await tokenContract.balanceOf(recipientAddress);
      
      console.log(`\nNew staking contract balance: ${ethers.formatUnits(newBalance, tokenDecimals)} ${tokenSymbol}`);
      console.log(`Recipient balance: ${ethers.formatUnits(recipientBalance, tokenDecimals)} ${tokenSymbol}`);
    } else {
      throw new Error('Transaction failed');
    }
    
  } catch (error) {
    console.error("Error during token recovery:", error.message);
    if (error.error?.message) {
      console.error("Error details:", error.error.message);
    }
  } finally {
    rl.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });