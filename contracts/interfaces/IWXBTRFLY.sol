// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWXBTRFLY is IERC20{

    function wrapFromBTRFLY( uint _amount ) external returns ( uint );
    function unwrapToBTRFLY( uint _amount ) external returns ( uint );
    function wrapFromxBTRFLY( uint _amount ) external returns ( uint );
    function unwrapToxBTRFLY( uint _amount ) external returns ( uint );
    function xBTRFLYValue( uint _amount ) external view returns ( uint );
    function wBTRFLYValue( uint _amount ) external view returns ( uint );
    function realIndex() external view returns ( uint );

}