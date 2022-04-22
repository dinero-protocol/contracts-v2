// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Authority} from "@rari-capital/solmate/src/auth/Auth.sol";

// Mocked authority contract for testing purposes, where only the assigned 'admin' is authorized
contract MockAuthority is Authority {
    address public immutable admin;

    constructor(address _admin) {
        admin = _admin;
    }

    function canCall(
        address user,
        address target,
        bytes4 functionSig
    ) external view returns (bool) {
        return user == admin;
    }
}
