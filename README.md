# MoonCat Cryptocurrency Project

A decentralized cryptocurrency platform built on UniChain with staking and token sale functionality, using Gnosis Safe multisig and timelock controllers for enhanced security.

## Project Overview

This project implements a cryptocurrency ecosystem on UniChain featuring:

- **MoonCat Token (MCT)**: ERC20 token with tax mechanism
- **Staking DApp**: Allow users to stake tokens with flexible time periods
- **Token Sale DApp**: Secure sale platform with Pyth price feed integration
- **Governance & Security**: Gnosis Safe multi-signature wallets and timelock controllers

## Architecture

The project follows a multi-layered security architecture:

```
Token/Staking/Sale Contracts → Timelock Controllers → Gnosis Safe Multisig Wallets
```

- **Contracts**: Core business logic
- **Timelock Controllers**: 48-hour delay for critical operations
- **Gnosis Safe**: Multi-signature wallets requiring multiple approvals

## Getting Started

### Prerequisites

- Node.js v16+ and npm
- Git
- Hardhat

### Installation

1. Clone the repository
```bash
git clone https://github.com/your-username/mooncat_ai.git
cd mooncat_ai
```

2. Install dependencies
```bash
npm install
```

3. Create environment file
```bash
cp .env.example .env
```

4. Update `.env` with your configuration values

### Project Structure

```
mooncat_ai/
├── contracts/              # Smart contracts
│   ├── libraries/          # Main contract implementations
│   ├── interfaces/         # Contract interfaces 
│   └── mocks/              # Testing mock contracts
├── scripts/                # Deployment and operational scripts
│   ├── deployment/         # Contract deployment scripts
│   │   ├── initial/        # Initial deployment scripts
│   │   ├── gnosis-migration/  # Safe migration scripts
│   │   ├── mock/           # Test token deployment
│   │   └── timelock/       # Timelock deployment
│   ├── operations/         # Contract operation scripts
│   │   ├── Sale/           # Token sale operations
│   │   ├── Staking/        # Staking operations
│   │   └── timelock/       # Timelock operations
│   └── utils/              # Utility scripts
├── test/                   # Test scripts
│   └── Checks/             # Status check scripts
├── config/                 # Configuration files
├── data/                   # Data storage
│   └── analytics/          # Analytics data storage
└── deployments/            # Deployment records
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SEPOLIA_RPC_URL` | UniChain Sepolia RPC URL | `https://unichain-sepolia.g.alchemy.com/v2/` |
| `MAINNET_RPC_URL` | UniChain Mainnet RPC URL | `https://mainnet.unichain.org/` |
| `SEPOLIA_DEPLOYER_PRIVATE_KEY` | Private key for testnet deployment | `0x1234...` |
| `MAINNET_DEPLOYER_PRIVATE_KEY` | Private key for mainnet deployment | `0x1234...` |
| `ALCHEMY_API_KEY` | Alchemy API key | `abcd1234...` |
| `TOKEN_NAME` | MoonCat token name | `MoonCatToken` |
| `TOKEN_SYMBOL` | MoonCat token symbol | `MCT` |
| `TOKEN_INITIAL_SUPPLY` | Initial token supply | `1000000000` |
| `ETHERSCAN_API_KEY` | Etherscan API key for verification | `abcd1234...` |
| `UNICHAIN-SEPOLIA-TESTNET_MCT_ADDRESS` | Testnet MCT address | `0x1234...` |
| `UNICHAIN-SEPOLIA-TESTNET_USDT_ADDRESS` | Testnet USDT address | `0x1234...` |
| `UNICHAIN-SEPOLIA-TESTNET_SALE_ADDRESS` | Testnet sale contract address | `0x1234...` |
| `UNICHAIN-SEPOLIA-TESTNET_STAKING_ADDRESS` | Testnet staking contract address | `0x1234...` |
| `TREASURY_WALLET` | Wallet to receive funds | `0x1234...` |
| `RAISE_GOAL` | Fundraising goal in USDT | `2000000` |
| `TOKEN_PRICE` | Token price in USDT | `0.005` |
| `MIN_CONTRIBUTION` | Minimum contribution in USDT | `100` |
| `MAX_CONTRIBUTION` | Maximum contribution in USDT | `50000` |
| `TIMELOCK_DELAY` | Timelock delay in seconds | `172800` |

## Deployment Process

The deployment follows a specific sequence to ensure security:

1. Deploy token and staking contracts
```bash
npx hardhat run scripts/deployment/initial/2_deploy_contracts.js --network unichain-sepolia-testnet
```

2. Set staking rates
```bash
npx hardhat run scripts/deployment/initial/3_set_rates.js --network unichain-sepolia-testnet
```

3. Deploy token sale contract
```bash
npx hardhat run scripts/deployment/initial/4_deploy-token-sale.js --network unichain-sepolia-testnet
```

4. Transfer ownership to Gnosis Safe multisig wallets
```bash
npx hardhat run scripts/deployment/gnosis-migration/MoonCatToken-Gnosis.js --network unichain-sepolia-testnet
npx hardhat run scripts/deployment/gnosis-migration/MoonCatStaking-Gnosis.js --network unichain-sepolia-testnet
npx hardhat run scripts/deployment/gnosis-migration/TokenSaleWithPyth-Gnosis.js --network unichain-sepolia-testnet
```

5. Deploy timelock controllers
```bash
npx hardhat run scripts/deployment/timelock/deploy-timelocks.js --network unichain-sepolia-testnet
```

6. Transfer control from Gnosis Safes to timelocks
```bash
npx hardhat run scripts/deployment/timelock/transfer-to-timelocks.js --network unichain-sepolia-testnet
```

## Operation Scripts

The project includes scripts for various operational tasks:

### Token Sale Operations
- Emergency mode management
- Sale finalization
- Token withdrawals
- Pause/unpause functionality

### Staking Operations
- Rate changes
- Reward checking
- Timelock control

### Analytics
- Purchase data extraction
- Distribution of promotional tokens

## Security Features

This project implements several layers of security:

1. **Multi-signature control**: All admin actions require multiple signatures
2. **Timelock delay**: 48-hour delay for critical operations
3. **Role-based access control**: Granular permissions with specific roles
4. **CertiK audit compliance**: Implements security best practices

## Configuration

Configuration happens through:

1. Environment variables (`.env` file)
2. Safe configuration files (`keys.test.json` and `keys.prod.json` - keep these secure!)
3. Network configuration in `hardhat.config.js`

## Testing

Run tests with:

```bash
npx hardhat test
```

Verify contract status with check scripts:

```bash
npx hardhat run test/Checks/checkTokenSaleStatus.js --network unichain-sepolia-testnet
```

## Production Contracts

| Contract | Address | Description |
|----------|---------|-------------|
| MoonCat Token (MCT) | 0xE5a0f0147DA2242feE005bBE3235568eB8f1E020 | ERC20 token with tax mechanism |
| MoonCat Staking | 0x8b286D3bA74D8789BAbdbaee4E437Cf8dc207D21 | Staking contract with flexible periods |
| Token Sale with Pyth | 0x052735699EE90f1EbD515dc52626b65Fe8E8D2C4 | Token sale with price feed integration |
| USDT Token | 0x588ce4f028d8e7b53b687865d6a67b3a54c75518 | USDT integration for purchases |
| Token Safe | 0x3DC75CaE73f7fC873900E4B44d562268a114b591 | Gnosis Safe for token governance |
| Staking Safe | 0x172DbAC189387eE26177d3b58C24F0e5009E7a48 | Gnosis Safe for staking governance |
| Staking Timelock | 0xc1EdCe0500cb2C55066852565215AC5FD1DFbE7a | 48-hour timelock for staking changes |
| Sale Safe | 0xF9Dcd6b011C95fc839F7223923F8efd5838CB3B9 | Gnosis Safe for sale governance |
| Sale Timelock | 0x3ca57B121A2cD5e83655141223603BDe433654BF | 48-hour timelock for sale changes |
| Treasury Wallet | 0xe5dd89E9A619894862adb336Daa27759CA4D03DD | Funds collection address |

## License

[MIT License](LICENSE)

## Acknowledgments

- Gnosis Safe for multi-signature wallet implementation
- OpenZeppelin for secure contract libraries
- Pyth Network for price feed oracles
- UniChain for blockchain infrastructure