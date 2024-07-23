import { expect } from 'chai';
import Web3 from 'web3';
import HDWalletProvider from '@truffle/hdwallet-provider';
import dotenv from 'dotenv';
import MoontestToken from '../build/contracts/MoontestToken.json' assert { type: 'json' };

dotenv.config();

const web3 = new Web3(new HDWalletProvider(process.env.DEPLOYER_PRIVATE_KEY, `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`));

const tokenContract = new web3.eth.Contract(MoontestToken.abi);
const accounts = await web3.eth.getAccounts();
const [owner, user1, user2] = accounts;

describe("MoontestToken", function() {
  let token;

  before(async function() {
    const name = process.env.TOKEN_NAME;
    const symbol = process.env.TOKEN_SYMBOL;
    const initialSupply = parseInt(process.env.TOKEN_INITIAL_SUPPLY, 10);

    token = await tokenContract.deploy({
      data: MoontestToken.bytecode,
      arguments: [name, symbol, initialSupply]
    }).send({ from: owner, gas: 5500000 });
  });

  it("should have correct name and symbol", async function() {
    const name = await token.methods.name().call();
    const symbol = await token.methods.symbol().call();
    expect(name).to.equal(process.env.TOKEN_NAME);
    expect(symbol).to.equal(process.env.TOKEN_SYMBOL);
  });

  it("should assign total supply to the owner", async function() {
    const totalSupply = await token.methods.totalSupply().call();
    const ownerBalance = await token.methods.balanceOf(owner).call();
    expect(totalSupply.toString()).to.equal(ownerBalance.toString());
  });

  it("should transfer tokens correctly", async function() {
    await token.methods.transfer(user1, 100).send({ from: owner });
    const user1Balance = await token.methods.balanceOf(user1).call();
    expect(user1Balance.toString()).to.equal("100");
  });

  it("should approve and transferFrom tokens correctly", async function() {
    await token.methods.approve(user2, 50).send({ from: user1 });
    await token.methods.transferFrom(user1, user2, 50).send({ from: user2 });
    const user1Balance = await token.methods.balanceOf(user1).call();
    const user2Balance = await token.methods.balanceOf(user2).call();
    expect(user1Balance.toString()).to.equal("50");
    expect(user2Balance.toString()).to.equal("50");
  });

  it("should burn tokens correctly", async function() {
    await token.methods.burn(50).send({ from: user1 });
    const user1Balance = await token.methods.balanceOf(user1).call();
    const totalSupply = await token.methods.totalSupply().call();
    expect(user1Balance.toString()).to.equal("0");
    expect(totalSupply.toString()).to.equal("999950");
  });
});
