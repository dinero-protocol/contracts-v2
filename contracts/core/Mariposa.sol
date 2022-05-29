// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Mariposa
/// @author never

/**
    @notice 
    Allowance Contract For the Redacted Ecosystem to mint BTRFLY
*/

interface IBTRFLY {
    function mint(address account_, uint256 amount_) external;
}

contract Mariposa is Ownable {
    IBTRFLY public immutable btrfly;
    uint256 public immutable supplyCap;
    uint256 public emissions;
    uint256 public totalAllowances;
    bool public isShutdown;
    mapping(address => uint256) public mintAllowances;
    mapping(address => bool) public isMinter;
    address[] public minters; // Push only, beware false-positives. Only for viewing.

    event AllowanceSet(address indexed minter, uint256 amount);
    event Requested(
        address indexed minter,
        address indexed recipient,
        uint256 amount
    );
    event AddedMinter(address indexed minter);
    event IncreasedAllowance(address indexed minter, uint256 amount);
    event DecreasedAllowance(address indexed minter, uint256 amount);
    event Shutdown();

    error ZeroAddress();
    error ZeroAmount();
    error ExceedsAllowance();
    error UnderflowAllowance();
    error ExceedsSupplyCap();
    error Closed();
    error NotMinter();
    error AlreadyAdded();

    /** 
        @notice Contructor
        @param _btrfly address  BTRFLY token address
        @param _supplyCap uint256  Max number of tokens contract can emmit
     */
    constructor(address _btrfly, uint256 _supplyCap) {
        if (_btrfly == address(0)) revert ZeroAddress();
        btrfly = IBTRFLY(_btrfly);

        if (_supplyCap == 0) revert ZeroAmount();
        supplyCap = _supplyCap;
    }

    /** 
        @notice Mints tokens to recipient 
        @param  recipient address  To recieve minted tokens
        @param amount uint256  Amount
     */
    function request(address recipient, uint256 amount) external {
        if (!isMinter[msg.sender]) revert NotMinter();
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (isShutdown) revert Closed();
        if (amount > mintAllowances[msg.sender]) revert ExceedsAllowance();

        emissions += amount;
        mintAllowances[msg.sender] -= amount;
        totalAllowances -= amount;

        btrfly.mint(recipient, amount);
        emit Requested(msg.sender, recipient, amount);
    }

    /** 
        @notice Add address to minter role.
        @param  minter address  Minter address
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
        @param  minter address  Address with minting rights
        @param amount uint256  Amount to decrease
     */
    function increaseAllowance(address minter, uint256 amount)
        external
        onlyOwner
    {
        if (minter == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!isMinter[minter]) revert NotMinter();
        if (emissions + totalAllowances + amount > supplyCap)
            revert ExceedsSupplyCap();

        totalAllowances += amount;
        mintAllowances[minter] += amount;

        emit IncreasedAllowance(minter, amount);
    }

    /** 
        @notice Decrease allowance
        @param  minter address  Address with minting rights
        @param amount uint256  Amount to decrease
     */
    function decreaseAllowance(address minter, uint256 amount)
        external
        onlyOwner
    {
        if (minter == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!isMinter[minter]) revert NotMinter();
        if (mintAllowances[minter] < amount) revert UnderflowAllowance();

        totalAllowances -= amount;
        mintAllowances[minter] -= amount;

        emit DecreasedAllowance(minter, amount);
    }

    /** 
        @notice Emergency method to shutdown requests
     */
    function shutdown() external onlyOwner {
        if (isShutdown) revert Closed();

        isShutdown = true;

        emit Shutdown();
    }
}
