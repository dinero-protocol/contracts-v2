// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

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

    error ZeroAddress();
    error ZeroAmount();
    error ExceedsAllowance();
    error ExceedsSupplyCap();
    error Shutdown();
    error NotMinter();
    error NoChange();
    

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

    /** 
        @notice Mints tokens to recipient 
        @param  _recipient  address  To recieve minted tokens
        @param _amount      uint256  Amount
     */
    function request(address _recipient, uint256 _amount) external {
        // sanitize variables
        if (_recipient == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (isShutdown) revert Shutdown();
        if (!isMinter[msg.sender]) revert NotMinter();
        if (_amount > mintAllowances[msg.sender]) revert ExceedsAllowance();
        // may not be necessary as setAllowance checks this
        emissions += _amount;
        if (emissions > supplyCap) revert ExceedsSupplyCap();
        mintAllowances[msg.sender] -= _amount;
        
        totalAllowances -= _amount;

        btrfly.mint(_recipient, _amount);
        emit Requested(msg.sender, _recipient, _amount);
    }

    /** 
        @notice Sets allowances to addresses 
        @param  _contract  address  Contract with minting rights
        @param _amount     uint256  Amount
     */
    function setAllowance(address _contract, uint256 _amount)
        external
        onlyOwner
    {
        // sanitize variables
        if (_amount == 0) revert ZeroAmount();
        if (_contract == address(0)) revert ZeroAddress();

        uint256 currentAllowance = mintAllowances[_contract];

        if (_amount == currentAllowance) revert NoChange();
        if (emissions + totalAllowances + _amount > supplyCap) revert ExceedsSupplyCap();

        if (!isMinter[_contract]) {
            isMinter[_contract] = true;
            minters.push(_contract);
        }
        
        
        if (_amount > currentAllowance)
            // increasing allowances from 0 or positive integer
            increaseAllowance(_amount - currentAllowance);
            
        else
            // decreasing total allowances from non 0 and > currentAllowance integer
            decreaseAllowance(currentAllowance - _amount);

        mintAllowances[_contract] = _amount;
        emit AllowanceSet(_contract, _amount);
    }

    /**
        @notice Increase allowance
        @param _amount  uint256  Amount to be increased
     */
    function increaseAllowance(uint _amount) internal {
        totalAllowances += _amount;
    }

    /**
        @notice Decrease allowance
        @param _amount  uint256  Amount to be decreased
     */
    function decreaseAllowance(uint _amount) internal {
        totalAllowances -= _amount;
    }
}
