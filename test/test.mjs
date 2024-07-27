import { assert } from 'chai';
import Web3 from 'web3';
import HDWalletProvider from '@truffle/hdwallet-provider';
import dotenv from 'dotenv';
import contractABI from '../build/contracts/MoonTestToken.json' assert { type: 'json' };

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const alchemyApiKey = process.env.ALCHEMY_API_KEY;

//*Deployment Tests *//

if (!privateKey || !alchemyApiKey) {
  throw new Error('Missing environment variables');
}

const contractBytecode = contractABI.bytecode;

describe('Alchemy Endpoint and Contract Deployment', function() {
  this.timeout(0);

  let web3;
  let accounts;
  let moonTestToken;
  let provider;

  before(async () => {
    console.log('Setting up provider...');
    provider = new HDWalletProvider({
      privateKeys: [privateKey],
      providerOrUrl: `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`
    });

    web3 = new Web3(provider);
    accounts = await web3.eth.getAccounts();
    console.log('Accounts:', accounts);
  });

  it('should connect to Alchemy endpoint', async () => {
    console.log('Connecting to Alchemy endpoint...');
    const latestBlock = await web3.eth.getBlockNumber();
    console.log('Latest Block Number:', latestBlock);
    assert.isNumber(Number(latestBlock), 'Latest block is a number');
    await sleep(1000); // Add delay to avoid rate limit
  });

  it('should deploy MoonTestToken contract', async () => {
    console.log('Deploying MoonTestToken contract...');
    const MoonTestToken = new web3.eth.Contract(contractABI.abi);
    moonTestToken = await MoonTestToken.deploy({
      data: contractBytecode,
      arguments: [web3.utils.toWei('1000000', 'ether')] // Initial supply
    }).send({ from: accounts[0], gas: 5500000 });

    console.log('MoonTestToken contract deployed at:', moonTestToken.options.address);
    assert.ok(moonTestToken.options.address, 'Contract deployed');
    await sleep(1000); // Add delay to avoid rate limit
  });

  it('should have initial supply of tokens', async () => {
    console.log('Checking initial supply of tokens...');
    const totalSupply = await moonTestToken.methods.totalSupply().call();
    console.log('Total supply of tokens:', totalSupply);
    assert.equal(totalSupply, web3.utils.toWei('1000000', 'ether'), 'Initial supply is correct');
  });

  after(async () => {
    provider.engine.stop(); // Properly stop the provider
  });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
