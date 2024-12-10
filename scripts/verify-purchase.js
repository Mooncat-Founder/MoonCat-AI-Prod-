require('dotenv').config();
const { createPublicClient, http, formatUnits, parseEther } = require('viem');
const { unichain } = require('viem/chains');

const SALE_ABI = [
    {
        "inputs": [],
        "name": "getEthPrice",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "usdAmount", "type": "uint256"}],
        "name": "calculateTokensForUsd",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "remainingTokens",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
];

async function verifyPurchase() {
    const client = createPublicClient({
        chain: {
            ...unichain,
            id: 1301,
            name: 'Unichain Sepolia',
            rpcUrls: {
                default: { http: ['https://sepolia.unichain.org'] }
            }
        },
        transport: http()
    });

    const SALE_ADDRESS = process.env.SALE_CONTRACT_ADDRESS_SEPOLIA;
    const ETH_AMOUNT = '0.03'; // The amount you're trying to purchase with

    try {
        console.log('\nVerifying purchase calculations...');
        console.log('ETH Amount:', ETH_AMOUNT, 'ETH');

        // Get ETH price from contract
        const ethPrice = await client.readContract({
            address: SALE_ADDRESS,
            abi: SALE_ABI,
            functionName: 'getEthPrice'
        });
        console.log('ETH Price:', formatUnits(ethPrice, 6), 'USD');

        // Calculate USD value
        const ethAmountWei = parseEther(ETH_AMOUNT);
        const usdValue = (ethAmountWei * BigInt(ethPrice)) / BigInt(1e18);
        console.log('USD Value:', formatUnits(usdValue, 6), 'USD');

        // Calculate tokens to be received
        const tokensToReceive = await client.readContract({
            address: SALE_ADDRESS,
            abi: SALE_ABI,
            functionName: 'calculateTokensForUsd',
            args: [usdValue]
        });
        console.log('Tokens to receive:', formatUnits(tokensToReceive, 18), 'MCT');

        // Check remaining tokens
        const remainingTokens = await client.readContract({
            address: SALE_ADDRESS,
            abi: SALE_ABI,
            functionName: 'remainingTokens'
        });
        console.log('Remaining tokens:', formatUnits(remainingTokens, 18), 'MCT');

        // Compare
        if (tokensToReceive > remainingTokens) {
            console.log('\n⚠️ ERROR: Purchase would exceed remaining tokens!');
            console.log('Tokens requested:', formatUnits(tokensToReceive, 18));
            console.log('Tokens available:', formatUnits(remainingTokens, 18));
        }

    } catch (error) {
        console.error('\nError during verification:', error);
    }
}

verifyPurchase().catch(console.error);