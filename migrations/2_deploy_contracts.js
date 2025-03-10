const hre = require("hardhat");

async function deployAndVerify(contractName, args) {
  // Deploy
  const factory = await hre.ethers.getContractFactory(contractName);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${contractName} deployed to:`, address);

  // Wait for a few confirmations and verify immediately
  await contract.deploymentTransaction().wait(5);
  
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: args,
    });
    console.log(`${contractName} verified successfully`);
  } catch (e) {
    // Check if the error is because the contract is already verified
    if (e.message.includes("Contract already verified") || 
        e.message.includes("ContractAlreadyVerifiedError") ||
        e.message.includes("already verified")) {
      console.log(`${contractName} is already verified on the block explorer`);
    } else {
      console.log(`${contractName} verification failed:`, e);
    }
  }

  return contract;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy and verify MoonCatToken
  const moonCatToken = await deployAndVerify("MoonCatToken", ["MoonCat", "MCT", "1000000000"]);
  const moonCatTokenAddress = await moonCatToken.getAddress();

  // Deploy and verify MoonCatStaking
  const moonCatStaking = await deployAndVerify("MoonCatStaking", [moonCatTokenAddress]);
  const moonCatStakingAddress = await moonCatStaking.getAddress();

  // Exclude Staking Contract from Tax
  const tx = await moonCatToken.excludeFromTax(moonCatStakingAddress);
  await tx.wait();
  console.log("Staking contract excluded from tax");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });