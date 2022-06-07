// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

/// @title Mariposa
/// @author never

/**
    @notice 
    Allowance Contract For the Redacted Ecosystem to mint BTRFLY
*/

interface IBTRFLY {
    function mint(address account_, uint256 amount_) external;
}

contract Mariposa is Pausable, Ownable {
    IBTRFLY public immutable btrflyV2;
    uint256 public immutable supplyCap;

    uint256 public emissions;
    uint256 public totalAllowances;
    mapping(address => uint256) public mintAllowances;
    mapping(address => bool) public isMinter;

    // Push only, beware false-positives. Only for viewing.
    address[] public minters;

    event Requested(
        address indexed minter,
        address indexed recipient,
        uint256 amount
    );
    event AddedMinter(address minter);
    event IncreasedAllowance(address indexed minter, uint256 amount);
    event DecreasedAllowance(address indexed minter, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error ExceedsAllowance();
    error UnderflowAllowance();
    error ExceedsSupplyCap();
    error IsPaused();
    error NotMinter();
    error AlreadyAdded();

    /** 
        @param  _btrflyV2   address  BTRFLYV2 token address
        @param  _supplyCap  uint256  Max number of tokens contract can emmit
     */
    constructor(address _btrflyV2, uint256 _supplyCap) {
        if (_btrflyV2 == address(0)) revert ZeroAddress();
        if (_supplyCap == 0) revert ZeroAmount();

        btrflyV2 = IBTRFLY(_btrflyV2);
        supplyCap = _supplyCap;
    }

    /** 
        @notice Mints tokens for recipient 
        @param  recipient  address  To receive minted tokens
        @param  amount     uint256  Amount
     */
    function request(address recipient, uint256 amount) external {
        if (!isMinter[msg.sender]) revert NotMinter();
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (paused()) revert IsPaused();
        if (amount > mintAllowances[msg.sender]) revert ExceedsAllowance();

        emissions += amount;
        mintAllowances[msg.sender] -= amount;
        totalAllowances -= amount;

        emit Requested(msg.sender, recipient, amount);

        btrflyV2.mint(recipient, amount);
    }

    /** 
        @notice Add address to minter role.
        @param  minter  address  Minter address
     */
    function addMinter(address minter) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        if (isMinter[minter]) revert AlreadyAdded();

        isMinter[minter] = true;
        minters.push(minter);

        emit AddedMinter(minter);
    }

    /** 
        @notice Increase allowance
        @param  minter  address  Address with minting rights
        @param  amount  uint256  Amount to increase
     */
    function increaseAllowance(address minter, uint256 amount)
        external
        onlyOwner
    {
        if (!isMinter[minter]) revert NotMinter();
        if (amount == 0) revert ZeroAmount();
        if (emissions + totalAllowances + amount > supplyCap)
            revert ExceedsSupplyCap();

        totalAllowances += amount;
        mintAllowances[minter] += amount;

        emit IncreasedAllowance(minter, amount);
    }

    /** 
        @notice Decrease allowance
        @param  minter  address  Address with minting rights
        @param  amount  uint256  Amount to decrease
     */
    function decreaseAllowance(address minter, uint256 amount)
        external
        onlyOwner
    {
        if (!isMinter[minter]) revert NotMinter();
        if (amount == 0) revert ZeroAmount();
        if (mintAllowances[minter] < amount) revert UnderflowAllowance();

        totalAllowances -= amount;
        mintAllowances[minter] -= amount;

        emit DecreasedAllowance(minter, amount);
    }

    /** 
        @notice Set the contract's pause state
        @param state  bool  Pause state
    */
    function setPauseState(bool state) external onlyOwner {
        if (state) {
            _pause();
        } else {
            _unpause();
        }
    }
}
