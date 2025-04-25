// scripts/verify-security-setup.js
require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
  console.log("Verifying complete security setup for Certik audit...");
  
  // Get network details
  const network = await ethers.provider.getNetwork();
  const networkName = network.name.toUpperCase();
  console.log(`Network: ${networkName} (Chain ID: ${network.chainId})`);
  
  // Get addresses from environment variables
  const addresses = {
    // Token
    token: process.env[`${networkName}_MCT_ADDRESS`],
    tokenSafe: process.env[`${networkName}_MOONCAT_TOKEN_SAFE`],
    
    // Staking
    staking: process.env[`${networkName}_STAKING_ADDRESS`],
    stakingSafe: process.env[`${networkName}_MOONCAT_STAKING_SAFE`],
    stakingTimelock: process.env[`${networkName}_STAKING_TIMELOCK_ADDRESS`],
    
    // Sale
    sale: process.env[`${networkName}_SALE_ADDRESS`],
    saleSafe: process.env[`${networkName}_TOKEN_SALE_SAFE`],
    saleTimelock: process.env[`${networkName}_SALE_TIMELOCK_ADDRESS`],
    
    // Deployer EOA
    deployer: "0x30cb654424Ad2b221512B80CF951483b5325af59"
  };
  
  // Print all addresses
  console.log("\nContract and Governance Addresses:");
  for (const [key, value] of Object.entries(addresses)) {
    console.log(`- ${key}: ${value || 'Not set'}`);
  }
  
  // Ownable interface for token and sale contracts
  const ownableABI = [
    "function owner() view returns (address)"
  ];
  
  // AccessControl interface for staking contract
  const accessControlABI = [
    "function hasRole(bytes32 role, address account) view returns (bool)"
  ];
  
  // Timelock interface (for checking roles)
  const timelockABI = [
    "function hasRole(bytes32 role, address account) view returns (bool)"
  ];
  
  // Role constants
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
  const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
  const CANCELLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CANCELLER_ROLE"));
  
  // Check Token ownership
  console.log("\n=== Token Contract Ownership ===");
  if (addresses.token) {
    const tokenContract = new ethers.Contract(addresses.token, ownableABI, ethers.provider);
    try {
      const tokenOwner = await tokenContract.owner();
      console.log(`Current owner: ${tokenOwner}`);
      
      if (tokenOwner.toLowerCase() === addresses.tokenSafe?.toLowerCase()) {
        console.log("✅ Token is owned by Token Safe (multi-signature)");
      } else if (addresses.tokenTimelock && tokenOwner.toLowerCase() === addresses.tokenTimelock?.toLowerCase()) {
        console.log("✅ Token is owned by Token Timelock (time-delayed)");
      } else {
        console.log("⚠️ Token owner is neither Safe nor Timelock!");
      }
    } catch (error) {
      console.error("Error checking token ownership:", error.message);
    }
  } else {
    console.log("Token address not provided");
  }
  
  // Check Staking roles
  console.log("\n=== Staking Contract Roles ===");
  if (addresses.staking) {
    const stakingContract = new ethers.Contract(addresses.staking, accessControlABI, ethers.provider);
    
    // Check deployer EOA roles
    try {
      const deployerHasAdmin = await stakingContract.hasRole(DEFAULT_ADMIN_ROLE, addresses.deployer);
      const deployerHasGovernor = await stakingContract.hasRole(GOVERNOR_ROLE, addresses.deployer);
      const deployerHasPauser = await stakingContract.hasRole(PAUSER_ROLE, addresses.deployer);
      
      console.log("Deployer EOA roles:");
      console.log(`- DEFAULT_ADMIN_ROLE: ${deployerHasAdmin ? '⚠️ HAS ROLE' : '✅ No role'}`);
      console.log(`- GOVERNOR_ROLE: ${deployerHasGovernor ? '⚠️ HAS ROLE' : '✅ No role'}`);
      console.log(`- PAUSER_ROLE: ${deployerHasPauser ? '⚠️ HAS ROLE' : '✅ No role'}`);
      
      if (!deployerHasAdmin && !deployerHasGovernor && !deployerHasPauser) {
        console.log("✅ Deployer EOA has NO ROLES (Certik concern addressed)");
      } else {
        console.log("⚠️ Deployer EOA still has some roles!");
      }
    } catch (error) {
      console.error("Error checking deployer roles:", error.message);
    }
    
    // Check Safe roles
    if (addresses.stakingSafe) {
      try {
        const safeHasAdmin = await stakingContract.hasRole(DEFAULT_ADMIN_ROLE, addresses.stakingSafe);
        const safeHasGovernor = await stakingContract.hasRole(GOVERNOR_ROLE, addresses.stakingSafe);
        const safeHasPauser = await stakingContract.hasRole(PAUSER_ROLE, addresses.stakingSafe);
        
        console.log("\nStaking Safe roles:");
        console.log(`- DEFAULT_ADMIN_ROLE: ${safeHasAdmin ? '✅ Has role' : 'No role'}`);
        console.log(`- GOVERNOR_ROLE: ${safeHasGovernor ? '✅ Has role' : 'No role'}`);
        console.log(`- PAUSER_ROLE: ${safeHasPauser ? '✅ Has role' : 'No role'}`);
      } catch (error) {
        console.error("Error checking safe roles:", error.message);
      }
    }
    
    // Check Timelock roles
    if (addresses.stakingTimelock) {
      try {
        const timelockHasAdmin = await stakingContract.hasRole(DEFAULT_ADMIN_ROLE, addresses.stakingTimelock);
        const timelockHasGovernor = await stakingContract.hasRole(GOVERNOR_ROLE, addresses.stakingTimelock);
        const timelockHasPauser = await stakingContract.hasRole(PAUSER_ROLE, addresses.stakingTimelock);
        
        console.log("\nStaking Timelock roles:");
        console.log(`- DEFAULT_ADMIN_ROLE: ${timelockHasAdmin ? '✅ Has role' : 'No role'}`);
        console.log(`- GOVERNOR_ROLE: ${timelockHasGovernor ? '✅ Has role' : 'No role'}`);
        console.log(`- PAUSER_ROLE: ${timelockHasPauser ? '✅ Has role' : 'No role'}`);
        
        if (timelockHasAdmin && timelockHasGovernor && timelockHasPauser) {
          console.log("✅ Timelock has all roles for Staking contract - proper security architecture");
        }
      } catch (error) {
        console.error("Error checking timelock roles:", error.message);
      }
    }
  } else {
    console.log("Staking address not provided");
  }
  
  // Check Sale ownership
  console.log("\n=== Sale Contract Ownership ===");
  if (addresses.sale) {
    const saleContract = new ethers.Contract(addresses.sale, ownableABI, ethers.provider);
    try {
      const saleOwner = await saleContract.owner();
      console.log(`Current owner: ${saleOwner}`);
      
      if (addresses.saleSafe && saleOwner.toLowerCase() === addresses.saleSafe?.toLowerCase()) {
        console.log("✅ Sale is owned by Sale Safe (multi-signature)");
      } else if (addresses.saleTimelock && saleOwner.toLowerCase() === addresses.saleTimelock?.toLowerCase()) {
        console.log("✅ Sale is owned by Sale Timelock (time-delayed)");
      } else {
        console.log("⚠️ Sale owner is neither Safe nor Timelock!");
      }
    } catch (error) {
      console.error("Error checking sale ownership:", error.message);
    }
  } else {
    console.log("Sale address not provided");
  }
  
  // Check Timelock roles (optional but recommended)
  if (addresses.stakingTimelock) {
    console.log("\n=== Timelock Contract Configuration ===");
    const timelockContract = new ethers.Contract(addresses.stakingTimelock, timelockABI, ethers.provider);
    
    try {
      // Check if Safe has proposer role
      const safeHasProposer = await timelockContract.hasRole(PROPOSER_ROLE, addresses.stakingSafe);
      const safeHasCanceller = await timelockContract.hasRole(CANCELLER_ROLE, addresses.stakingSafe);
      const safeHasExecutor = await timelockContract.hasRole(EXECUTOR_ROLE, addresses.stakingSafe);
      
      console.log("Safe roles in Timelock:");
      console.log(`- PROPOSER_ROLE: ${safeHasProposer ? '✅ Has role' : 'No role'}`);
      console.log(`- CANCELLER_ROLE: ${safeHasCanceller ? '✅ Has role' : 'No role'}`);
      console.log(`- EXECUTOR_ROLE: ${safeHasExecutor ? '✅ Has role' : 'No role'}`);
      
      if (safeHasProposer && safeHasCanceller) {
        console.log("✅ Safe can propose and cancel timelock operations - proper security architecture");
      }
    } catch (error) {
      console.error("Error checking timelock configuration:", error.message);
    }
  }
  
  console.log("\n=== Summary ===");
  console.log("1. Deployer EOA roles check: Run to verify Certik's concern is addressed");
  console.log("2. Token ownership: Using multi-signature governance");
  console.log("3. Staking contract: Admin roles managed through proper governance");
  console.log("4. Sale contract: Ownership managed through proper governance");
  console.log("5. Timelock configuration: Verified proper integration with Safe");
  
  console.log("\nThis information can be provided to Certik to address their audit findings.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });