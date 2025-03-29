// scripts/execute-timelock-operation.js
const hre = require("hardhat");
const path = require('path');
require('dotenv').config();
const readline = require('readline');
const { getOperationById, getAllOperations } = require('../../utils/timelock-operations-storage.js');

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
  "function hashOperation(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external pure returns (bytes32)",
  "function isOperation(bytes32 id) external view returns (bool)",
  "function isOperationPending(bytes32 id) external view returns (bool)",
  "function isOperationReady(bytes32 id) external view returns (bool)",
  "function isOperationDone(bytes32 id) external view returns (bool)",
  "function getTimestamp(bytes32 id) external view returns (uint256)"
];

// Contract ABI for basic contract interactions
const CONTRACT_ABI = [
  "function unpause() external",
  "function pause() external",
  "function paused() external view returns (bool)"
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
    const { ethers } = hre;
    
    // Determine network
    const network = hre.network.name;
    console.log(`Running on network: ${network}`);
    
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
    let safeAddress, timelockAddress, contractAddress;
    
    if (network.includes("mainnet")) {
      safeAddress = process.env["UNICHAIN-MAINNET_TOKEN_SALE_SAFE"];
      timelockAddress = process.env["UNICHAIN-MAINNET_SALE_TIMELOCK_ADDRESS"];
      contractAddress = process.env["UNICHAIN-MAINNET_SALE_ADDRESS"];
    } else {
      safeAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_TOKEN_SALE_SAFE"];
      timelockAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_SALE_TIMELOCK_ADDRESS"];
      contractAddress = process.env["UNICHAIN-SEPOLIA-TESTNET_SALE_ADDRESS"];
    }
    
    console.log('\nCurrent configuration:');
    console.log(`Safe address: ${safeAddress}`);
    console.log(`Timelock address: ${timelockAddress}`);
    console.log(`Target contract address: ${contractAddress}`);
    
    // Initialize variables - declare them only once at the top level
    let targetAddress = contractAddress;
    let valueAmount = 0;
    let functionData = '';
    let predecessorValue = ethers.ZeroHash;
    let saltValue = '';
    let operationIdentifier = '';
    let shouldSkipToExecution = false;
    
    // Process command line arguments
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === "--id" && i + 1 < process.argv.length) {
        operationIdentifier = process.argv[i + 1];
      }
    }
    
    if (operationIdentifier) {
      console.log(`Operation ID provided: ${operationIdentifier}`);
      
      // Check if we have this operation in storage
      const savedOperation = getOperationById(operationIdentifier);
      
      if (savedOperation) {
        console.log(`Found saved operation: ${savedOperation.description || 'Unknown operation'}`);
        
        // Connect to the timelock contract
        const provider = ethers.provider;
        const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
        
        // Check operation status
        const exists = await timelock.isOperation(operationIdentifier);
        if (!exists) {
          console.error('Error: Operation does not exist on the timelock.');
          rl.close();
          process.exit(1);
        }
        
        const isPending = await timelock.isOperationPending(operationIdentifier);
        const isReady = await timelock.isOperationReady(operationIdentifier);
        const isDone = await timelock.isOperationDone(operationIdentifier);
        const timestamp = await timelock.getTimestamp(operationIdentifier);
        
        console.log('\nOperation Status:');
        console.log(`Status: ${isDone ? 'Executed' : isReady ? 'Ready for execution' : isPending ? 'Pending' : 'Unknown'}`);
        console.log(`Scheduled execution time: ${new Date(Number(timestamp) * 1000).toLocaleString()}`);
        
        if (isDone) {
          console.log('This operation has already been executed.');
          rl.close();
          process.exit(0);
        }
        
        if (!isReady) {
          const now = new Date();
          const executionTime = new Date(Number(timestamp) * 1000);
          const timeUntilReady = (executionTime - now) / 1000;
          
          console.log(`\nOperation is not ready yet. Time until ready: ${Math.round(timeUntilReady)} seconds (${(timeUntilReady / 3600).toFixed(2)} hours)`);
          console.log('Please wait until the timelock delay has passed.');
          rl.close();
          process.exit(0);
        }
        
        // Use saved parameters
        targetAddress = savedOperation.target;
        valueAmount = savedOperation.value;
        functionData = savedOperation.data;
        predecessorValue = savedOperation.predecessor;
        saltValue = savedOperation.salt;
        
        console.log('\nUsing saved parameters:');
        console.log(`Target: ${targetAddress}`);
        console.log(`Value: ${valueAmount}`);
        console.log(`Data: ${functionData}`);
        console.log(`Predecessor: ${predecessorValue}`);
        console.log(`Salt: ${saltValue}`);
        
        const confirmExecution = await prompt('\nDo you want to execute this operation? (y/n): ');
        if (confirmExecution.toLowerCase() !== 'y') {
          console.log('Operation aborted.');
          rl.close();
          process.exit(0);
        }
        
        // Skip to execution
        shouldSkipToExecution = true;
      } else {
        console.log('No saved details found for this operation ID. You will need to provide the parameters manually.');
      }
    }

    // If we're not going straight to execution with saved parameters
    if (!shouldSkipToExecution) {
      // Interactive mode to get operation details
      console.log('\n==== Timelock Operation Executor ====');
      
      // Get contract actions
      const contractInterface = new ethers.Interface(CONTRACT_ABI);
      const actionOptions = {
        '1': { name: 'Unpause Contract', data: contractInterface.encodeFunctionData("unpause", []) },
        '2': { name: 'Pause Contract', data: contractInterface.encodeFunctionData("pause", []) },
        '3': { name: 'Custom Action (Enter Function Data Manually)', data: null }
      };
      
      // Ask which action to perform
      console.log('\nAvailable actions:');
      for (const [key, value] of Object.entries(actionOptions)) {
        console.log(`${key}: ${value.name}`);
      }
      
      let actionChoice = await prompt('Select action (1-3): ');
      
      if (actionChoice === '3') {
        // Custom action - ask for function data
        functionData = await prompt('Enter function data (hex): ');
        if (!functionData.startsWith('0x')) {
          functionData = '0x' + functionData;
        }
      } else {
        functionData = actionOptions[actionChoice]?.data;
        if (!functionData) {
          console.log('Invalid action selected. Defaulting to unpause.');
          functionData = actionOptions['1'].data;
        }
      }
      
      // Ask for execution method
      console.log('\nExecution method:');
      console.log('1: Use known Operation ID');
      console.log('2: Use known Salt value');
      
      const executionMethod = await prompt('Select execution method (1-2): ');
      
      if (executionMethod === '1') {
        // Use known Operation ID
        operationIdentifier = await prompt('Enter Operation ID: ');
        
        // Connect to the timelock contract
        const provider = ethers.provider;
        const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
        
        // Check if the operation exists
        const exists = await timelock.isOperation(operationIdentifier);
        if (!exists) {
          console.error('Error: Operation does not exist on the timelock.');
          rl.close();
          process.exit(1);
        }
        
        // Check operation status
        const isPending = await timelock.isOperationPending(operationIdentifier);
        const isReady = await timelock.isOperationReady(operationIdentifier);
        const isDone = await timelock.isOperationDone(operationIdentifier);
        const timestamp = await timelock.getTimestamp(operationIdentifier);
        
        console.log('\nOperation Status:');
        console.log(`Status: ${isDone ? 'Executed' : isReady ? 'Ready for execution' : isPending ? 'Pending' : 'Unknown'}`);
        console.log(`Scheduled execution time: ${new Date(Number(timestamp) * 1000).toLocaleString()}`);
        
        if (isDone) {
          console.log('This operation has already been executed.');
          rl.close();
          process.exit(0);
        }
        
        if (!isReady) {
          const now = new Date();
          const executionTime = new Date(Number(timestamp) * 1000);
          const timeUntilReady = (executionTime - now) / 1000;
          
          console.log(`\nOperation is not ready yet. Time until ready: ${Math.round(timeUntilReady)} seconds (${(timeUntilReady / 3600).toFixed(2)} hours)`);
          console.log('Please wait until the timelock delay has passed.');
          rl.close();
          process.exit(0);
        }
        
        // To execute an operation by ID, we need to know the original parameters
        console.log('\nTo execute this operation, we need the original parameters:');
        targetAddress = await prompt('Enter target contract address: ');
        valueAmount = await prompt('Enter ETH value (usually 0): ');
        functionData = await prompt('Enter function data (hex): ');
        predecessorValue = await prompt('Enter predecessor (usually 0x0): ');
        saltValue = await prompt('Enter salt value: ');
        
        // Verify the parameters by calculating the operation ID
        const calculatedId = await timelock.hashOperation(targetAddress, valueAmount, functionData, predecessorValue, saltValue);
        
        if (calculatedId.toLowerCase() !== operationIdentifier.toLowerCase()) {
          console.log('\nWarning: The calculated operation ID does not match the provided ID.');
          console.log(`Calculated: ${calculatedId}`);
          console.log(`Provided: ${operationIdentifier}`);
          
          const proceed = await prompt('Do you want to proceed anyway? (y/n): ');
          if (proceed.toLowerCase() !== 'y') {
            console.log('Operation aborted.');
            rl.close();
            process.exit(0);
          }
        }
      } else {
        // Use known Salt value
        targetAddress = contractAddress;
        valueAmount = 0;
        // Function data was set earlier
        predecessorValue = ethers.ZeroHash;
        saltValue = await prompt('Enter Salt value: ');
        
        // Connect to the timelock contract
        const provider = ethers.provider;
        const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
        
        // Calculate the operation ID
        const calculatedId = await timelock.hashOperation(targetAddress, valueAmount, functionData, predecessorValue, saltValue);
        console.log(`\nCalculated Operation ID: ${calculatedId}`);
        operationIdentifier = calculatedId;
        
        // Check if the operation exists
        const exists = await timelock.isOperation(operationIdentifier);
        if (!exists) {
          console.error('Error: Operation does not exist on the timelock.');
          rl.close();
          process.exit(1);
        }
        
        // Check operation status
        const isPending = await timelock.isOperationPending(operationIdentifier);
        const isReady = await timelock.isOperationReady(operationIdentifier);
        const isDone = await timelock.isOperationDone(operationIdentifier);
        const timestamp = await timelock.getTimestamp(operationIdentifier);
        
        console.log('\nOperation Status:');
        console.log(`Status: ${isDone ? 'Executed' : isReady ? 'Ready for execution' : isPending ? 'Pending' : 'Unknown'}`);
        console.log(`Scheduled execution time: ${new Date(Number(timestamp) * 1000).toLocaleString()}`);
        
        if (isDone) {
          console.log('This operation has already been executed.');
          rl.close();
          process.exit(0);
        }
        
        if (!isReady) {
          const now = new Date();
          const executionTime = new Date(Number(timestamp) * 1000);
          const timeUntilReady = (executionTime - now) / 1000;
          
          console.log(`\nOperation is not ready yet. Time until ready: ${Math.round(timeUntilReady)} seconds (${(timeUntilReady / 3600).toFixed(2)} hours)`);
          console.log('Please wait until the timelock delay has passed.');
          rl.close();
          process.exit(0);
        }
      }
    }
    
    // Confirm execution
    console.log('\nOperation is ready to execute with the following parameters:');
    console.log(`Target: ${targetAddress}`);
    console.log(`Value: ${valueAmount}`);
    console.log(`Data: ${functionData}`);
    console.log(`Predecessor: ${predecessorValue}`);
    console.log(`Salt: ${saltValue}`);
    
    if (!shouldSkipToExecution) {
      const confirmExecution = await prompt('\nDo you want to execute this operation? (y/n): ');
      if (confirmExecution.toLowerCase() !== 'y') {
        console.log('Operation aborted.');
        rl.close();
        process.exit(0);
      }
    }
    
    // Execute the operation through the Safe
    console.log('\nPreparing to execute the operation...');
    
    // Connect to contracts
    const provider = ethers.provider;
    const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    const timelockContract = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
    
    // Create wallet instances from private keys
    const signers = safeConfig.signers.map(key => 
      new ethers.Wallet(key, provider)
    );
    
    console.log(`\nLoaded ${signers.length} signers`);
    
    // Get Safe info
    const nonce = await safeContract.nonce();
    const threshold = await safeContract.getThreshold();
    const domainSeparator = await safeContract.domainSeparator();
    
    console.log(`Safe nonce: ${nonce.toString()}`);
    console.log(`Required threshold: ${threshold.toString()}`);
    
    if (signers.length < threshold) {
      console.error(`Error: Not enough signers. Have ${signers.length}, need ${threshold}.`);
      rl.close();
      process.exit(1);
    }
    
    // Prepare the execute transaction
    const executeTxData = timelockContract.interface.encodeFunctionData("execute", [
      targetAddress, valueAmount, functionData, predecessorValue, saltValue
    ]);
    
    // Create the transaction object
    const safeTx = {
      to: timelockAddress,
      value: ethers.parseEther("0"),
      data: executeTxData,
      operation: 0, // Call
      safeTxGas: ethers.parseEther("0"),
      baseGas: ethers.parseEther("0"),
      gasPrice: ethers.parseEther("0"),
      gasToken: ethers.ZeroAddress,
      refundReceiver: ethers.ZeroAddress,
      nonce: nonce
    };
    
    // Collect signatures from owners
    console.log('\nCollecting signatures...');
    let signatures = [];
    const thresholdValue = typeof threshold.toNumber === 'function' ? threshold.toNumber() : Number(threshold);
    for (let i = 0; i < thresholdValue; i++) {
      console.log(`Getting signature from signer ${i + 1} (${signers[i].address})...`);
      const signature = await generateSignature(signers[i], safeTx, domainSeparator);
      signatures.push(signature);
    }
    
    // Sort signatures by signer address
    signatures.sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
    const signatureBytes = "0x" + signatures.map(sig => sig.data.slice(2)).join("");
    
    // Execute the transaction
    console.log('\nExecuting transaction through Gnosis Safe...');
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
    
    console.log('Transaction sent. Waiting for confirmation...');
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log('\nOperation executed successfully!');
      console.log(`Transaction hash: ${receipt.hash}`);
      
      // Check if contract is now unpaused/paused
      try {
        const targetContract = new ethers.Contract(targetAddress, CONTRACT_ABI, provider);
        const isPaused = await targetContract.paused();
        console.log(`Contract paused status: ${isPaused ? "PAUSED" : "NOT PAUSED"}`);
      } catch (error) {
        // Ignore errors if the contract doesn't have a paused function
      }
    } else {
      console.error('Transaction failed!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.error?.message) {
      console.error('Error details:', error.error.message);
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