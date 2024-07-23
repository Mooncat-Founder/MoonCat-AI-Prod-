## Development Environment Setup Guide

### Tools and Software to Install

1. **Node.js and npm**
   - Install the latest stable version of Node.js which includes npm.
   - [Download Node.js](https://nodejs.org/)

2. **Git**
   - Install Git for version control.
   - [Download Git](https://git-scm.com/)

3. **Visual Studio Code (VS Code)**
   - Install VS Code for code editing.
   - [Download VS Code](https://code.visualstudio.com/)

4. **Truffle Suite**
   Install Truffle for smart contract development.
   npm install -g truffle

5. **HDWalletProvider**
   - Install HDWalletProvider for connecting to Ethereum networks.
   npm install @truffle/hdwallet-provider


6. **OpenZeppelin Contracts**
   - Install OpenZeppelin contracts for secure smart contract development.
   npm install @openzeppelin/contracts


7. **Mocha and Chai**
   - Install Mocha and Chai for testing.
   npm install mocha chai

8. **dotenv**
   - Install dotenv for environment variable management.
   npm install dotenv

### Environment Configuration

1. **Setup Environment Variables**
   - Create a `.env` file in the root of your project with the following variables:
     INFURA_PROJECT_ID=your_infura_project_id
     INFURA_PROJECT_SECRET=your_infura_project_secret
     DEPLOYER_PRIVATE_KEY=your_private_key_for_testnet
     MAINNET_INFURA_PROJECT_ID=your_mainnet_infura_project_id
     MAINNET_PRIVATE_KEY=your_mainnet_private_key
     TOKEN_NAME=MoonTestToken
     TOKEN_SYMBOL=MTT

2. **Git Configuration**
   - Ensure your Git configuration is set up correctly:
     git config --global user.name "Your Name"
     git config --global user.email "your-email@example.com"

3. **SSH Keys for GitHub**
   - Generate SSH keys and add them to your GitHub account for secure access.
   - [GitHub SSH Key Setup Guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)

### Project Setup

1. **Clone Repository**
   - Clone your GitHub repository to your local machine:
     git clone git@github.com:Mooncat-Founder/mooncat_ai.git

2. **Install Dependencies**
   - Navigate to your project directory and install all dependencies:
     cd mooncat_ai
     npm install

3. **Powershell scripts**
Open PowerShell as an administrator and run the following command to set the execution policy:
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

### Running the Project

1. **Compile Contracts**
   truffle compile

2. **Run Tests**
   npx mocha -r esm test/test.mjs

3. **Deploy Contracts**
   truffle migrate --network sepolia