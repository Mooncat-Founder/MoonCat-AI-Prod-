// scripts/verify-timelocks.js
const hre = require("hardhat");

async function main() {
  console.log("Verifying Sale Timelock...");
  await hre.run("verify:verify", {
    address: "0x3ca57B121A2cD5e83655141223603BDe433654BF",
    contract: "contracts/TimeLock.sol:MoonCatSaleTimelock",
    constructorArguments: [
      172800,
      ["0xF9Dcd6b011C95fc839F7223923F8efd5838CB3B9"],
      ["0xF9Dcd6b011C95fc839F7223923F8efd5838CB3B9"]
    ],
  });

  console.log("Verifying Staking Timelock...");
  await hre.run("verify:verify", {
    address: "0xc1EdCe0500cb2C55066852565215AC5FD1DFbE7a",
    contract: "contracts/TimeLock.sol:MoonCatStakingTimelock",
    constructorArguments: [
      172800,
      ["0x172DbAC189387eE26177d3b58C24F0e5009E7a48"],
      ["0x172DbAC189387eE26177d3b58C24F0e5009E7a48"]
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });