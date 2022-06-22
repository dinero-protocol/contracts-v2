// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Mariposa} from "../core/Mariposa.sol";

contract Bond {
    Mariposa public immutable mariposa;

    constructor(address _mariposa) {
        require(_mariposa != address(0), "Bond: zero address");
        mariposa = Mariposa(_mariposa);
    }

    function bond(uint256 _amount) external {
        mariposa.mintFor(address(this), _amount);
    }
}
