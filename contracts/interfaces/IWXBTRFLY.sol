// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWXBTRFLY is IERC20 {
    function wrapFromBTRFLY(uint256 _amount) external returns (uint256);

    function unwrapToBTRFLY(uint256 _amount) external returns (uint256);

    function wrapFromxBTRFLY(uint256 _amount) external returns (uint256);

    function unwrapToxBTRFLY(uint256 _amount) external returns (uint256);

    function xBTRFLYValue(uint256 _amount) external view returns (uint256);

    function wBTRFLYValue(uint256 _amount) external view returns (uint256);

    function realIndex() external view returns (uint256);
}
