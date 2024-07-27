import { expect } from 'chai';
import Web3 from 'web3';
import HDWalletProvider from '@truffle/hdwallet-provider';
import dotenv from 'dotenv';
import MoontestToken from '../build/contracts/MoontestToken.json' assert { type: 'json' };
import Staking from '../build/contracts/Staking.json' assert { type: 'json' };

dotenv.config();

const provider = new HDWalletProvider({
  privateKeys: [process.env.DEPLOYER_PRIVATE_KEY],
  providerOrUrl: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
  headers: {
    'Infura-Secret': process.env.INFURA_PROJECT_SECRET
  }
});

const web3 = new Web3(provider);
const tokenContract = new web3.eth.Contract(MoontestToken.abi, process.env.TOKEN_ADDRESS);
const stakingContract = new web3.eth.Contract(Staking.abi, process.env.STAKING_ADDRESS);

const [owner, user1, user2] = [process.env.OWNER_ADDRESS, process.env.USER1_ADDRESS, process.env.USER2_ADDRESS];

describe("Full Functionality Tests", function() {
  this.timeout(20000); // Increase timeout to 20 seconds to handle async operations

  it("should have correct name and symbol", async function() {
    const name = await tokenContract.methods.name().call();
    const symbol = await tokenContract.methods.symbol().call();
    expect(name).to.equal(process.env.TOKEN_NAME);
    expect(symbol).to.equal(process.env.TOKEN_SYMBOL);
  });

  it("should assign total supply to the owner", async function() {
    const totalSupply = await tokenContract.methods.totalSupply().call();
    const ownerBalance = await tokenContract.methods.balanceOf(owner).call();
    expect(totalSupply.toString()).to.equal(ownerBalance.toString());
  });

  it("should transfer tokens correctly", async function() {
    await tokenContract.methods.transfer(user1, 100).send({ from: owner });
    const user1Balance = await tokenContract.methods.balanceOf(user1).call();
    expect(user1Balance.toString()).to.equal("100");
  });

  it("should approve and transferFrom tokens correctly", async function() {
    await tokenContract.methods.approve(user2, 50).send({ from: user1 });
    await tokenContract.methods.transferFrom(user1, user2, 50).send({ from: user2 });
    const user1Balance = await tokenContract.methods.balanceOf(user1).call();
    const user2Balance = await tokenContract.methods.balanceOf(user2).call();
    expect(user1Balance.toString()).to.equal("50");
    expect(user2Balance.toString()).to.equal("50");
  });

  it("should burn tokens correctly", async function() {
    await tokenContract.methods.burn(50).send({ from: user1 });
    const user1Balance = await tokenContract.methods.balanceOf(user1).call();
    const totalSupply = await tokenContract.methods.totalSupply().call();
    expect(user1Balance.toString()).to.equal("0");
    expect(totalSupply.toString()).to.equal("999950");
  });

  it("should allow staking", async function() {
    await tokenContract.methods.approve(stakingContract.options.address, 100).send({ from: owner });
    await stakingContract.methods.stake(100).send({ from: owner });
    const balance = await stakingContract.methods.balanceOf(owner).call();
    expect(balance.toString()).to.equal('100');
  });

  it("should allow requesting unlock", async function() {
    await stakingContract.methods.requestUnlock().send({ from: owner });
    const unlockTime = await stakingContract.methods.unlockTime(owner).call();
    expect(parseInt(unlockTime)).to.be.greaterThan(0);
  });

  it("should allow unstaking after unlock period", async function() {
    const advanceTime = async (seconds) => {
      await web3.currentProvider.send({
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [seconds],
        id: new Date().getTime(),
      }, () => {});
      await web3.currentProvider.send({
        jsonrpc: '2.0',
        method: 'evm_mine',
        id: new Date().getTime(),
      }, () => {});
    };

    await advanceTime(604800); // Advance 1 week
    await stakingContract.methods.unstake().send({ from: owner });
    const balance = await stakingContract.methods.balanceOf(owner).call();
    expect(balance.toString()).to.equal('0');
  });
/**  after(async () => {
    provider.engine.stop();
    process.exit(0); // Ensure the script terminates correctly
  }); */

});
