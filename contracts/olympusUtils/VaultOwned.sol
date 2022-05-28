// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VaultOwned
/// @author Realkinando

/**
    @notice 
    Taken from the Olympus V1 codebase and modernised with Solidity Custom Errors 
*/

contract VaultOwned is Ownable {
    address internal _vault;

    error NotVault();

    /**
      @notice allows owner to set vault address
      @param vault_     address     Vault Address
   */
    function setVault(address vault_) public onlyOwner returns (bool) {
        _vault = vault_;

        return true;
    }

    /**
      @notice exposes internal _vault variable to be viewed externally
      @return _vault     address     Vault Address
   */
    function vault() public view returns (address) {
        return _vault;
    }

    /**
      @notice reverts if vault address is not caller
   */
    modifier onlyVault() {
        if (_vault != msg.sender) revert NotVault();
        _;
    }
}
