// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.12;

import {BTRFLY} from "../old/BTRFLY.sol";

contract MockDistributor {
    struct Info {
        uint256 rate; // in ten-thousandths ( 5000 = 0.5% )
        address recipient;
    }
    Info[] public info;

    address public to;
    uint256 public amount;

    BTRFLY internal _btrfly;

    constructor(address btrfly_){
        _btrfly = BTRFLY(btrfly_);
    }

    function setMint(address to_, uint256 amount_) external{
        to = to_;
        amount = amount_;
    }

    function distribute() external returns(bool){
        _btrfly.mint(to,amount);
        amount = 0;
        return true;
    }

}