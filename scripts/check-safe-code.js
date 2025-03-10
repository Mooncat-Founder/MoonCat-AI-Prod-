// check-safe-code.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const safeAddress = "0xaE7CC0148aa077fa27eDef95AC985D483184074F";
  
  // Get network info first
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  
  console.log(`Checking code at address: ${safeAddress} on network: ${network.name}`);
  console.log(`Network: ${network.name}, Chain ID: ${network.chainId}`);
  
  // Check if contract exists
  const code = await provider.getCode(safeAddress);
  console.log(`Code length: ${(code.length - 2) / 2} bytes`); // Subtract 2 for '0x' prefix and divide by 2 for bytes
  console.log(`Has code: ${code !== '0x'}`);
  
  if (code !== '0x') {
    console.log(`Code snippet: ${code.slice(0, 100)}...`);
  } else {
    console.log("No code at this address (it's either an EOA or the contract doesn't exist)");
  }
  
  // Also check balance
  const balance = await provider.getBalance(safeAddress);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  
  // Try to make a direct call to see if it's a proxy
  try {
    // This is a selector for "masterCopy()" which Safe proxies understand
    const masterCopyData = "0xa619486e00000000000000000000000000000000000000000000000000000000";
    const result = await provider.call({
      to: safeAddress,
      data: masterCopyData
    });
    console.log(`Proxy implementation: ${result}`);
  } catch (error) {
    console.log("Error checking for proxy implementation:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });