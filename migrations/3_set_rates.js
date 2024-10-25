const Staking = artifacts.require("MoonCatStaking");

module.exports = async function (deployer, network, accounts) {
  try {
    console.log("\nStarting rate setting process...");
    
    const stakingInstance = await Staking.deployed();
    console.log("Staking contract address:", stakingInstance.address);

    // Get debug info
    const debugInfo = await stakingInstance.getDebugInfo();
    console.log("\nContract Debug Info:", {
      isPaused: debugInfo[0],
      hasGovernorRole: debugInfo[1],
      hasAdminRole: debugInfo[2],
      currentRate7Days: debugInfo[3].toString(),
      currentRate1Year: debugInfo[4].toString(),
      lastChangeTime: new Date(debugInfo[5].toNumber() * 1000).toISOString(),
      timeUntilNextChange: debugInfo[6].toString() + " seconds",
      canChangeRate: debugInfo[7]
    });

    if (!debugInfo[7]) {
        console.log("\nWaiting for cooldown period...");
        await new Promise(resolve => setTimeout(resolve, (debugInfo[6].toNumber() + 1) * 1000));
    }

    // Set 7-day rate
    console.log("\nSetting 7-day rate...");
    console.log("Using address:", accounts[0]);
    
    const setRate7DaysTx = await stakingInstance.setRewardRate7Days(1999, {
        from: accounts[0],
        gas: 500000,
        gasPrice: web3.utils.toWei('2.5', 'gwei')
    });
    
    console.log("7-day rate transaction sent:", setRate7DaysTx.tx);

    // Wait between transactions
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Set 1-year rate
    console.log("\nSetting 1-year rate...");
    const setRate1YearTx = await stakingInstance.setRewardRate1Year(3500, {
        from: accounts[0],
        gas: 500000,
        gasPrice: web3.utils.toWei('2.5', 'gwei')
    });
    
    console.log("1-year rate transaction sent:", setRate1YearTx.tx);

    // Final verification
    const finalDebugInfo = await stakingInstance.getDebugInfo();
    console.log("\nFinal rates:", {
      sevenDays: finalDebugInfo[3].toString(),
      oneYear: finalDebugInfo[4].toString()
    });

  } catch (error) {
    console.error("\nRATE SETTING FAILED");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    if (error.receipt) {
      console.error("Transaction receipt:", JSON.stringify(error.receipt, null, 2));
    }
    throw error;
  }
};
