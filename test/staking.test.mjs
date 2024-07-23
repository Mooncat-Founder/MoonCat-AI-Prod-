import { expect } from 'chai';
import Web3 from 'web3';
import HDWalletProvider from '@truffle/hdwallet-provider';
import dotenv from 'dotenv';
import MoontestToken from '../build/contracts/MoontestToken.json' assert { type: 'json' };
import Staking from '../build/contracts/Staking.json' assert { type: 'json' };

dotenv.config();

const web3 = new Web3(new HDWalletProvider(process.env.DEPLOYER_PRIVATE_KEY, `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`));

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
    await web3.eth.sendTransaction({ from: owner, to: owner, value: 0, gas: 3000000, gasPrice: '20000000000' }); // Simulate passing time
    await staking.methods.unstake().send({ from: owner });
    const balance = await staking.methods.balanceOf(owner).call();
    expect(balance).to.equal('0');
  });
});
