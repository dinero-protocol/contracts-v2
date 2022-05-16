// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/// @title Mock Token
/// @author RealKinando

/// @notice Stand-in mock to simplify unit testing of the XBond contract

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20{

    uint8 internal _decimals;

    constructor(uint8 decimals_)
    ERC20("TEST","TEST")
    {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function mint(address recipient, uint256 amount) external{
        _mint(recipient, amount);
    }

}