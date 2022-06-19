// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BTRFLYV2
/// @author Realkinando

/**
    @notice 
    Minimum viable token for BTRFLYV2, follows same patterns as V1 token, but with improved readability
*/

contract BTRFLYV2 is AccessControl, ERC20("BTRFLY", "BTRFLY", 18) {
    bytes32 public constant MINTER_ROLE = "MINTER_ROLE";

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
        @notice Mint tokens
        @param  to      address  Address to receive tokens
        @param  amount  uint256  Amount to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
        @notice Burn tokens
        @param  amount  uint256  Amount to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
