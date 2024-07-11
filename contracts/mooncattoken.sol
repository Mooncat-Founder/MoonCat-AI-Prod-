// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Importing the ERC20 contract from OpenZeppelin library. 
// OpenZeppelin provides tested implementations of ERC standards to use in smart contracts.
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Defining a new contract named MoonCatToken that inherits from the ERC20 contract.
contract MoonCatToken is ERC20 {

    // Constructor is a special function that is executed once when the contract is deployed.
    // It initializes the token with a name and a symbol, and it mints the initial supply of tokens.
    constructor(uint256 initialSupply) ERC20("MoonCatToken", "MCAT") {
        // _mint is an internal function provided by the ERC20 contract.
        // It creates `initialSupply` tokens and assigns them to the address deploying the contract.
        // msg.sender is a global variable in Solidity that refers to the address that called the contract.
        _mint(msg.sender, initialSupply);
    }
}
