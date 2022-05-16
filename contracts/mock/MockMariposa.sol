// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/// @title Mock MARIPOSA
/// @author RealKinando

/// @notice Stand-in mock to simplify unit testing of the XBond contract

interface IBTRFLY {
    function mint(address account_, uint256 amount_) external;
}

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

    function setAllowance(uint256 amount) external {
        allowance = amount
    }

    function request(address _recipient, uint256 amount) external {
        if (amount > allowance) revert ExceedsAllowance()
        IBTRFLY(btrfly).mint(_recipient, amount);
    }

}
