// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A USDT-like token with 6 decimals that mints an initial supply to the deployer.
contract USDT is ERC20 {
    uint8 private _customDecimals;

    /**
     * @param name_ The token name (e.g., "Tether USD")
     * @param symbol_ The token symbol (e.g., "USDT")
     * @param decimals_ The number of decimals (should be 6 for USDT)
     * @param initialSupply The initial supply in whole tokens (will be scaled by 10^decimals_)
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        _customDecimals = decimals_;
        // _mint is defined in ERC20, so this will work only if we inherit from ERC20.
        _mint(msg.sender, initialSupply * (10 ** uint256(decimals_)));
    }

    /// @dev Override decimals to return our custom value (6 decimals for USDT)
    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }
}
