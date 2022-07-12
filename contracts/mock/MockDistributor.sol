// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.7.5;

contract MockDistributor {
    struct Info {
        uint256 rate; // in ten-thousandths ( 5000 = 0.5% )
        address recipient;
    }
    Info[] public info;
}
