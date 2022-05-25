// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

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

    event AllowanceSet(address indexed _contract, uint256 _amount);
    event Requested(
        address indexed _contract,
        address indexed _recipient,
        uint256 amount
    );
    event AddedMinter(address indexed _minter);
    event IncreasedAllowance(address indexed _contract, uint256 _amount);
    event DecreasedAllowance(address indexed _contract, uint256 _amount);
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
        @param _btrfly     address  BTRFLY token address
        @param _supplyCap  uint256  Max number of tokens contract can emmit
     */
    constructor(address _btrfly, uint256 _supplyCap) {
        if (_btrfly == address(0)) revert ZeroAddress();
        btrfly = IBTRFLY(_btrfly);

        if (_supplyCap == 0) revert ZeroAmount();
        supplyCap = _supplyCap;
    }

    modifier nonZeroAddress(address _user) {
        if (_user == address(0)) revert ZeroAddress();
        _;
    }

    modifier nonZeroAmount(uint256 _amount) {
        if (_amount == 0) revert ZeroAmount();
        _;
    }

    modifier onlyMinter(address _minter) {
        if (!isMinter[_minter]) revert NotMinter();
        _;
    }

    /** 
        @notice Mints tokens to recipient 
        @param  _recipient  address  To recieve minted tokens
        @param _amount      uint256  Amount
     */
    function request(address _recipient, uint256 _amount)
        external
        onlyMinter(msg.sender)
        nonZeroAddress(_recipient)
        nonZeroAmount(_amount)
    {
        if (isShutdown) revert Closed();
        if (_amount > mintAllowances[msg.sender]) revert ExceedsAllowance();
        if (emissions + _amount > supplyCap) revert ExceedsSupplyCap();
        emissions += _amount;
        mintAllowances[msg.sender] -= _amount;

        totalAllowances -= _amount;

        btrfly.mint(_recipient, _amount);
        emit Requested(msg.sender, _recipient, _amount);
    }

    /** 
        @notice Add address to minter role.
        @param  _minter  address  Minter address
     */
    function addMinter(address _minter)
        external
        onlyOwner
        nonZeroAddress(_minter)
    {
        if (isMinter[_minter]) revert AlreadyAdded();

        isMinter[_minter] = true;

        minters.push(_minter);

        emit AddedMinter(_minter);
    }

    /** 
        @notice Increase allowance
        @param  _contract  address  Contract with minting rights
        @param _amount     uint256  Amount to decrease
     */
    function increaseAllowance(address _contract, uint256 _amount)
        external
        onlyOwner
        nonZeroAddress(_contract)
        nonZeroAmount(_amount)
        onlyMinter(_contract)
    {
        if (emissions + totalAllowances + _amount > supplyCap)
            revert ExceedsSupplyCap();

        totalAllowances += _amount;
        mintAllowances[_contract] += _amount;

        emit IncreasedAllowance(_contract, _amount);
    }

    /** 
        @notice Decrease allowance
        @param  _contract  address  Contract with minting rights
        @param _amount     uint256  Amount to decrease
     */
    function decreaseAllowance(address _contract, uint256 _amount)
        external
        onlyOwner
        nonZeroAddress(_contract)
        nonZeroAmount(_amount)
        onlyMinter(_contract)
    {
        if (emissions + totalAllowances < _amount) revert UnderflowAllowance();
        if (mintAllowances[_contract] < _amount) revert UnderflowAllowance();

        totalAllowances -= _amount;
        mintAllowances[_contract] -= _amount;

        emit DecreasedAllowance(_contract, _amount);
    }

    /** 
        @notice Emergency method to shutdown the current contract
     */
    function shutdown() external onlyOwner {
        if (isShutdown) revert Closed();

        isShutdown = true;

        emit Shutdown();
    }
}
