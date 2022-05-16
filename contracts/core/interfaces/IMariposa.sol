// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

interface IMariposa {
  function addMinter(address _minter) external;
  function request(address _recipient, uint256 _amount) external;
  function increaseAllowance(address _contract, uint256 _amount) external;
  function decreaseAllowance(address _contract, uint256 _amount) external;
}