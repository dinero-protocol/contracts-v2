// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {VaultOwned} from "../olympusUtils/VaultOwned.sol";
import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";

/// @title BTRFLYV2
/// @author Realkinando

/**
    @notice 
    Minimum viable token for BTRFLYV2, follows same patterns as V1 token, but with improved readability
*/

contract BTRFLYV2 is VaultOwned, ERC20("BTRFLY", "BTRFLY", 18) {
    /**
        @notice Externally exposes the _mint method to the vault address
        @param  to      address  Address to receive tokens
        @param  amount  uint256  Amount to mint
     */
    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }
}
