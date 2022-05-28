// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

interface IStaking {
    function stake(uint256 _amount, address _recipient) external returns (bool);

    function claim(address recipient) external;

    function unstake(uint256 _amount, bool _trigger) external;

    function index() external view returns (uint256);
}
