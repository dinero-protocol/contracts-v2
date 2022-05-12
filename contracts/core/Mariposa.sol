// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;
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
    /*//////////////////////////////////////////////////////////////
                                 errors
    //////////////////////////////////////////////////////////////*/
    error ZeroAddress();
    error ZeroAmount();
    error ExceedsAllowance();
    error ExceedsSupplyCap();
    error Shutdown();
    error NotMinter();
    error NoChange();
    /*//////////////////////////////////////////////////////////////
                                 events
    //////////////////////////////////////////////////////////////*/
    event AllowanceSet(address indexed _contract, uint256 _amount);
    event Requested(
        address indexed _contract,
        address indexed _recipient,
        uint256 amount
    );
    /*//////////////////////////////////////////////////////////////
                                 constants functions
    //////////////////////////////////////////////////////////////*/
    IBTRFLY public immutable btrfly;
    uint256 public immutable supplyCap;
    /*//////////////////////////////////////////////////////////////
                                 global variables
    //////////////////////////////////////////////////////////////*/
    uint256 public emissions;
    uint256 public totalAllowances;
    bool public isShutdown;
    mapping(address => uint256) public mintAllowances;
    mapping(address => bool) public isMinter;
    address[] public minters; // Push only, beware false-positives. Only for viewing.

    /*//////////////////////////////////////////////////////////////
                                 constructor
    //////////////////////////////////////////////////////////////*/
    /**
        @param  _btrfly     address  BTRFLY token address
        @param _supplyCap uint256 Max number of tokens contract can emmit
     */
    constructor(address _btrfly, uint256 _supplyCap) {
        if (_btrfly == address(0)) revert ZeroAddress();
        if (_supplyCap == 0) revert ZeroAmount();
        btrfly = IBTRFLY(_btrfly);
        supplyCap = _supplyCap;
    }

    /*//////////////////////////////////////////////////////////////
                                 write  functions
    //////////////////////////////////////////////////////////////*/
    /** 
        @notice mints tokens to recipient 
        @param  _recipient  address to recieve minted tokens
        @param _amount    uint256  Amount
     */
    function request(address _recipient, uint256 _amount) external {
        // sanitize variables
        if (_amount == 0) revert ZeroAmount();
        if (isShutdown) revert Shutdown();
        if (!isMinter[msg.sender]) revert NotMinter();
        if (_amount > mintAllowances[msg.sender]) revert ExceedsAllowance();
        // may not be necissary as setAllowance checks this
        if (emissions + _amount > supplyCap) revert ExceedsSupplyCap();

        emissions += _amount;
        mintAllowances[msg.sender] -= _amount;
        totalAllowances -= _amount;

        btrfly.mint(_recipient, _amount);
        emit Requested(msg.sender, _recipient, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                                 policy  functions
    //////////////////////////////////////////////////////////////*/
    /** 
        @notice sets allowances to addresses 
        @param  _contract  address  contract with minting rights
        @param _amount    uint256  Amount
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
        }
        // check if contract is in minters list (save push)
        if (!listContains(minters, _contract)) {
            minters.push(_contract);
        }

        // increasing allowances from 0 or positive integer
        if (_amount > currentAllowance) {
            totalAllowances += _amount;
            // decreasing total allowances from non 0 and > currentAllowance integer
        } else {
            totalAllowances -= (currentAllowance - _amount);
        }

        mintAllowances[_contract] = _amount;
        emit AllowanceSet(_contract, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                                 read  functions
    //////////////////////////////////////////////////////////////*/

    /**
        @notice checks array to ensure against duplicate
        @param _list address[]
        @param _token address
        @return bool
     */
    function listContains(address[] storage _list, address _token)
        internal
        view
        returns (bool)
    {
        for (uint256 i = 0; i < _list.length; i++) {
            if (_list[i] == _token) {
                return true;
            }
        }
        return false;
    }
}
