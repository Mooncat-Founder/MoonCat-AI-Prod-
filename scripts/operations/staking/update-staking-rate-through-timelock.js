// scripts/update-staking-rate-through-timelock.js
const hre = require("hardhat");
const path = require('path');
require('dotenv').config();
const readline = require('readline');
const { saveOperation } = require('../../utils/timelock-operations-storage');

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

// Timelock ABI for the relevant functions
const TIMELOCK_ABI = [
  "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable returns (bytes)",
  "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external",
  "function hashOperation(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external pure returns (bytes32)",
  "function isOperation(bytes32 id) external view returns (bool)",
  "function isOperationPending(bytes32 id) external view returns (bool)",
  "function isOperationReady(bytes32 id) external view returns (bool)",
  "function isOperationDone(bytes32 id) external view returns (bool)",
  "function getTimestamp(bytes32 id) external view returns (uint256)",
  "function getMinDelay() external view returns (uint256)"
];

// Staking contract ABI for rate functions
const STAKING_ABI = [
  "function setRewardRate7Days(uint256 _newRate) external",
  "function setRewardRate1Year(uint256 _newRate) external",
  "function rewardRate7Days() external view returns (uint256)",
  "function rewardRate1Year() external view returns (uint256)",
  "function MAX_RATE_7DAYS() external view returns (uint256)",
  "function MIN_RATE_7DAYS() external view returns (uint256)",
  "function MAX_RATE_1YEAR() external view returns (uint256)",
  "function MIN_RATE_1YEAR() external view returns (uint256)",
  "function BASIS_POINTS() external view returns (uint256)"
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
    console.log("Starting staking rate update process through timelock...");
    
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
    let safeAddress, timelockAddress, stakingContractAddress;
    
    if (network.includes("mainnet")) {
      safeAddress = process.env["UNICHAIN-MAINNET_MOONCAT_STAKING_SAFE"];
      timelockAddress = process.env["UNICHAIN-MAINNET_STAKING_TIMELOCK_ADDRESS"];
      stakingContractAddress = process.env["UNICHAIN-MAINNET_STAKING_ADDRESS"];
    } else {
      safeAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_MOONCAT_STAKING_SAFE"];
      timelockAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_STAKING_TIMELOCK_ADDRESS"];
      stakingContractAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_STAKING_ADDRESS"];
    }
    
    // Check if we have all the required addresses
    if (!safeAddress || !timelockAddress || !stakingContractAddress) {
      throw new Error(`Missing environment variables for ${network}:\n` + 
        `${!safeAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_MOONCAT_STAKING_SAFE" : "UNICHAIN-SEPOLIA-TESTNET_MOONCAT_STAKING_SAFE") + "\n" : ""}` +
        `${!timelockAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_STAKING_TIMELOCK_ADDRESS" : "UNICHAIN-SEPOLIA-TESTNET_STAKING_TIMELOCK_ADDRESS") + "\n" : ""}` +
        `${!stakingContractAddress ? (network.includes("mainnet") ? "UNICHAIN-MAINNET_STAKING_ADDRESS" : "UNICHAIN-SEPOLIA-TESTNET_STAKING_ADDRESS") : ""}`
      );
    }
    
    console.log('Safe Address:', safeAddress);
    console.log('Timelock Address:', timelockAddress);
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
    
    // Connect to contracts
    const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    const timelockContract = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
    const stakingContract = new ethers.Contract(stakingContractAddress, STAKING_ABI, provider);
    
    // Get current rates and limits from contract
    const currentRate7Days = await stakingContract.rewardRate7Days();
    const currentRate1Year = await stakingContract.rewardRate1Year();
    const maxRate7Days = await stakingContract.MAX_RATE_7DAYS();
    const minRate7Days = await stakingContract.MIN_RATE_7DAYS();
    const maxRate1Year = await stakingContract.MAX_RATE_1YEAR();
    const minRate1Year = await stakingContract.MIN_RATE_1YEAR();
    const basisPoints = await stakingContract.BASIS_POINTS();
    
    console.log('\nCurrent staking rates:');
    console.log(`7-Day staking rate: ${currentRate7Days} (${(Number(currentRate7Days) / Number(basisPoints) * 100).toFixed(2)}% APR)`);
    console.log(`1-Year staking rate: ${currentRate1Year} (${(Number(currentRate1Year) / Number(basisPoints) * 100).toFixed(2)}% APR)`);
    
    console.log('\nRate limits:');
    console.log(`7-Day: Min ${minRate7Days} (${(Number(minRate7Days) / Number(basisPoints) * 100).toFixed(2)}% APR), Max ${maxRate7Days} (${(Number(maxRate7Days) / Number(basisPoints) * 100).toFixed(2)}% APR)`);
    console.log(`1-Year: Min ${minRate1Year} (${(Number(minRate1Year) / Number(basisPoints) * 100).toFixed(2)}% APR), Max ${maxRate1Year} (${(Number(maxRate1Year) / Number(basisPoints) * 100).toFixed(2)}% APR)`);
    
    // Get Safe and Timelock info
    const nonce = await safeContract.nonce();
    const threshold = await safeContract.getThreshold();
    const domainSeparator = await safeContract.domainSeparator();
    const timelockMinDelay = await timelockContract.getMinDelay();
    
    console.log('\nSafe info:');
    console.log(`Nonce: ${nonce}`);
    console.log(`Threshold: ${threshold} of ${signers.length} signers`);
    
    console.log('\nTimelock info:');
    console.log(`Minimum delay: ${timelockMinDelay} seconds (${Number(timelockMinDelay) / 3600} hours)`);
    
    // Ask which rate to update
    console.log('\nWhich rate would you like to update?');
    console.log('1: 7-Day staking rate');
    console.log('2: 1-Year staking rate');
    
    const rateChoice = await prompt('Enter choice (1 or 2): ');
    const is7DayRate = rateChoice === '1';
    
    const stakingPeriod = is7DayRate ? '7-Day' : '1-Year';
    const currentRate = is7DayRate ? currentRate7Days : currentRate1Year;
    const minRate = is7DayRate ? minRate7Days : minRate1Year;
    const maxRate = is7DayRate ? maxRate7Days : maxRate1Year;
    
    console.log(`\nUpdating ${stakingPeriod} staking rate`);
    console.log(`Current rate: ${currentRate} (${(Number(currentRate) / Number(basisPoints) * 100).toFixed(2)}% APR)`);
    
    // Get new rate
    const rateInputString = await prompt(`Enter new rate (as basis points, between ${minRate} and ${maxRate}): `);
    const newRate = parseInt(rateInputString, 10);
    
    if (isNaN(newRate)) {
      console.error("Invalid rate input. Please enter a valid number.");
      rl.close();
      process.exit(1);
    }
    
    if (newRate < Number(minRate) || newRate > Number(maxRate)) {
      console.error(`Rate must be between ${minRate} and ${maxRate}.`);
      rl.close();
      process.exit(1);
    }
    
    console.log(`\nNew rate will be: ${newRate} (${(newRate / Number(basisPoints) * 100).toFixed(2)}% APR)`);
    const confirmRate = await prompt('Confirm rate change? (y/n): ');
    
    if (confirmRate.toLowerCase() !== 'y') {
      console.log('Operation cancelled.');
      rl.close();
      process.exit(0);
    }
    
    // Create the function call to update the rate
    const stakingInterface = new ethers.Interface(STAKING_ABI);
    const funcName = is7DayRate ? "setRewardRate7Days" : "setRewardRate1Year";
    const callData = stakingInterface.encodeFunctionData(funcName, [newRate]);
    
    // Parameters for the timelock operation
    const target = stakingContractAddress;
    const value = 0;
    const data = callData;
    const predecessor = ethers.ZeroHash;
    const salt = ethers.id(`update-${stakingPeriod}-rate-${newRate}-${Date.now()}`);
    
    // Calculate the operation ID
    const operationId = await timelockContract.hashOperation(target, value, data, predecessor, salt);
    console.log('\nGenerated Operation ID:', operationId);
    
    // Save operation details for future reference
    saveOperation({
      id: operationId,
      target,
      value,
      data,
      predecessor,
      salt,
      description: `Update ${stakingPeriod} staking rate from ${currentRate} to ${newRate} (${(newRate / Number(basisPoints) * 100).toFixed(2)}% APR)`,
      network,
      timestamp: Date.now()
    });
    
    // Check if operation already exists
    const operationExists = await timelockContract.isOperation(operationId);
    
    if (operationExists) {
      const isPending = await timelockContract.isOperationPending(operationId);
      const isReady = await timelockContract.isOperationReady(operationId);
      const isDone = await timelockContract.isOperationDone(operationId);
      const timestamp = await timelockContract.getTimestamp(operationId);
      
      console.log('Operation already exists on the timelock!');
      console.log('Status:', isDone ? 'Executed' : isReady ? 'Ready for execution' : isPending ? 'Pending' : 'Unknown');
      console.log('Scheduled execution time:', new Date(Number(timestamp) * 1000).toLocaleString());
      
      if (isReady) {
        console.log('\nOperation is ready for execution! Preparing to execute...');
        
        // Prepare transaction for executing through the timelock
        const executeTxData = timelockContract.interface.encodeFunctionData("execute", [
          target, value, data, predecessor, salt
        ]);
        
        // Create the transaction object - targeting the timelock contract for execution
        const safeTx = {
          to: timelockAddress, // Target the timelock contract
          value: ethers.parseEther("0"),
          data: executeTxData, // Execute the scheduled operation
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
        
        console.log('Executing rate update through timelock...');
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
          console.log(`Rate update for ${stakingPeriod} executed successfully through timelock!`);
          console.log('Transaction hash:', receipt.hash);
          
          // Verify the updated rate
          const updatedRate = is7DayRate 
            ? await stakingContract.rewardRate7Days() 
            : await stakingContract.rewardRate1Year();
          
          console.log(`\nUpdated ${stakingPeriod} rate: ${updatedRate} (${(Number(updatedRate) / Number(basisPoints) * 100).toFixed(2)}% APR)`);
        } else {
          throw new Error('Transaction failed');
        }
      } else if (isPending) {
        console.log('\nOperation is pending and not yet ready for execution.');
        console.log('Please wait until the timelock delay has passed.');
      } else if (isDone) {
        console.log('\nOperation has already been executed.');
        console.log('The rate should already be updated.');
      }
    } else {
      console.log('\nOperation does not exist yet. Scheduling it on the timelock...');
      
      // Prepare transaction for scheduling through the timelock
      const scheduleTxData = timelockContract.interface.encodeFunctionData("schedule", [
        target, value, data, predecessor, salt, timelockMinDelay
      ]);
      
      // Create the transaction object - targeting the timelock contract
      const safeTx = {
        to: timelockAddress, // Target the timelock contract
        value: ethers.parseEther("0"),
        data: scheduleTxData, // Schedule the operation
        operation: 0, // Call
        safeTxGas: ethers.parseEther("0"),
        baseGas: ethers.parseEther("0"),
        gasPrice: ethers.parseEther("0"),
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
        nonce: nonce
      };
      
      console.log('Collecting signatures for scheduling...');
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
      
      console.log('Scheduling operation through timelock...');
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
        console.log('Operation scheduled successfully!');
        console.log('Transaction hash:', receipt.hash);
        console.log(`The operation will be ready for execution after ${timelockMinDelay.toString()} seconds`);
        console.log(`(approximately at ${new Date(Date.now() + Number(timelockMinDelay) * 1000).toLocaleString()})`);
      } else {
        throw new Error('Transaction failed');
      }
    }
    
    console.log('\nIMPORTANT: Operation details have been saved to timelock-operations.json');
    console.log('To execute this operation later:');
    console.log(`npx hardhat run scripts/execute-timelock-operation.js --network ${network} --id ${operationId}`);
    
    console.log('\nOperation details:');
    console.log('Operation ID:', operationId);
    console.log('Target:', target);
    console.log('Data:', data);
    console.log('Value:', value);
    console.log('Predecessor:', predecessor);
    console.log('Salt:', salt);
    console.log('Description:', `Update ${stakingPeriod} staking rate from ${currentRate} to ${newRate} (${(newRate / Number(basisPoints) * 100).toFixed(2)}% APR)`);
    
  } catch (error) {
    console.error("Error during staking rate update:", error.message);
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