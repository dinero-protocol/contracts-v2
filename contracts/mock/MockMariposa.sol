// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import {BTRFLYV2} from "../core/BTRFLYV2.sol";

/// @title Mock MARIPOSA
/// @author RealKinando

/// @notice Stand-in mock to simplify unit testing of the XBond contract

contract MockMariposa{
    /*//////////////////////////////////////////////////////////////
                                 errors
    //////////////////////////////////////////////////////////////*/
    error ExceedsAllowance();

    address public immutable btrfly;

    uint256 allowance;

    constructor(address btrfly_){
        btrfly = btrfly_;
    }

    function request(address _recipient, uint256 amount) external {
        BTRFLYV2(btrfly).mint(_recipient, amount);
    }

}
