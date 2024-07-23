import { assert } from 'chai';
import Web3 from 'web3';
import HDWalletProvider from '@truffle/hdwallet-provider';
import dotenv from 'dotenv';
import contractABI from '../build/contracts/MoonTestToken.json' assert { type: 'json' };

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const infuraProjectId = process.env.INFURA_PROJECT_ID;
const infuraProjectSecret = process.env.INFURA_PROJECT_SECRET;

//*Deployment Tests *//

if (!privateKey || !infuraProjectId || !infuraProjectSecret) {
  throw new Error('Missing environment variables');
}

const contractBytecode = contractABI.bytecode;

describe('Infura Endpoint and Contract Deployment', function() {
  this.timeout(0);

  let web3;
  let accounts;
  let moonTestToken;
  let provider;

  before(async () => {
    provider = new HDWalletProvider({
      privateKeys: [privateKey],
      providerOrUrl: `https://sepolia.infura.io/v3/${infuraProjectId}`,
      headers: { Authorization: `Basic ${Buffer.from(`${infuraProjectId}:${infuraProjectSecret}`).toString('base64')}` }
    });

    web3 = new Web3(provider);
    accounts = await web3.eth.getAccounts();
  });

  it('should connect to Infura endpoint', async () => {
    const latestBlock = await web3.eth.getBlockNumber();
    assert.isNumber(Number(latestBlock), 'Latest block is a number');
    console.log(`Latest Block Number: ${Number(latestBlock)}`);
    await sleep(1000); // Add delay to avoid rate limit
  });

  it('should deploy MoonTestToken contract', async () => {
    const MoonTestToken = new web3.eth.Contract(contractABI.abi);
    moonTestToken = await MoonTestToken.deploy({
      data: contractBytecode,
      arguments: [web3.utils.toWei('1000000', 'ether')] // Initial supply
    }).send({ from: accounts[0], gas: 5500000 });

    assert.ok(moonTestToken.options.address, 'Contract deployed');
    console.log(`Contract Address: ${moonTestToken.options.address}`);
    await sleep(1000); // Add delay to avoid rate limit
  });

  it('should have initial supply of tokens', async () => {
    const totalSupply = await moonTestToken.methods.totalSupply().call();
    assert.equal(totalSupply, web3.utils.toWei('1000000', 'ether'), 'Initial supply is correct');
  });

  after(async () => {
    provider.engine.stop(); // Properly stop the provider
  });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
