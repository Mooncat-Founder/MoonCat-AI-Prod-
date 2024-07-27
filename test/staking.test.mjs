import { expect } from 'chai';
import Web3 from 'web3';
import HDWalletProvider from '@truffle/hdwallet-provider';
import dotenv from 'dotenv';
import MoontestToken from '../build/contracts/MoontestToken.json' assert { type: 'json' };
import Staking from '../build/contracts/Staking.json' assert { type: 'json' };

dotenv.config();

const provider = new HDWalletProvider({
  privateKeys: [process.env.DEPLOYER_PRIVATE_KEY],
  providerOrUrl: `https://eth-sepolia.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`
});

const web3 = new Web3(provider);
const tokenContract = new web3.eth.Contract(MoontestToken.abi);
const stakingContract = new web3.eth.Contract(Staking.abi);
const accounts = await web3.eth.getAccounts();
const [owner, user1, user2] = accounts;

describe("Staking", () => {
  let token, staking;

  before(async () => {
    const name = process.env.TOKEN_NAME;
    const symbol = process.env.TOKEN_SYMBOL;
    const initialSupply = parseInt(process.env.TOKEN_INITIAL_SUPPLY, 10);

    token = await tokenContract.deploy({
      data: MoontestToken.bytecode,
      arguments: [name, symbol, initialSupply]
    }).send({ from: owner, gas: 5500000 });

    staking = await stakingContract.deploy({
      data: Staking.bytecode,
      arguments: [token.options.address]
    }).send({ from: owner, gas: 5500000 });
  });

  it("should allow staking", async () => {
    await token.methods.approve(staking.options.address, 100).send({ from: owner });
    await staking.methods.stake(100).send({ from: owner });
    const balance = await staking.methods.balanceOf(owner).call();
    expect(balance).to.equal('100');
  });

  it("should allow unstaking", async () => {
    await staking.methods.requestUnlock().send({ from: owner });
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
    await staking.methods.unstake().send({ from: owner });
    const balance = await staking.methods.balanceOf(owner).call();
    expect(balance).to.equal('0');
  });

  after(async () => {
    provider.engine.stop(); // Properly stop the provider
  });
});
