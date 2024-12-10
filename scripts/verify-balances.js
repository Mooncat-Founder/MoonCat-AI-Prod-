require('dotenv').config();
const { createPublicClient, http, formatUnits } = require('viem');
const { unichain } = require('viem/chains');

const ERC20_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
];

async function verifyBalances() {
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

    // Get addresses from .env
    const SALE_ADDRESS = process.env.SALE_CONTRACT_ADDRESS_SEPOLIA;
    const MCT_ADDRESS = process.env['UNICHAIN-SEPOLIA-TESTNET_MCT_ADDRESS'];

    console.log('\nContract Addresses from Environment:');
    console.log('Sale Contract (.env):', SALE_ADDRESS);
    console.log('MCT Token (.env):', MCT_ADDRESS);
    
    try {
        // Check actual token balance for both potential sale contract addresses
        console.log('\nChecking token balances...');
        
        // Check balance for address from .env
        const balance1 = await client.readContract({
            address: MCT_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [SALE_ADDRESS]
        });
        console.log(`Balance for ${SALE_ADDRESS}: ${formatUnits(balance1, 18)} MCT`);
        
        // Check balance for the other address we saw
        const otherAddress = '0x9F34E732BE4184C4B15A697fcdA5a2EFD006612E';
        const balance2 = await client.readContract({
            address: MCT_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [otherAddress]
        });
        console.log(`Balance for ${otherAddress}: ${formatUnits(balance2, 18)} MCT`);
        
        // Check balance for the address from your config
        const configAddress = '0x45321112c0F26975044826c71c443006Ab0B1858';
        const balance3 = await client.readContract({
            address: MCT_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [configAddress]
        });
        console.log(`Balance for ${configAddress}: ${formatUnits(balance3, 18)} MCT`);

    } catch (error) {
        console.error('\nError during verification:', error);
    }
}

// Run the verification
verifyBalances().catch(console.error);