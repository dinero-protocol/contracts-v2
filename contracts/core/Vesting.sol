// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IMariposa.sol";

/// @title Vesting
/// @author jack

/**
    @notice 
    Vesting Contract
*/

contract Vesting is Ownable {
    IMariposa public mariposa;
    // Basis token amount of address
    mapping (address => uint) public basisPoint;
    // Token percent to be minted in specific quarter
    mapping (uint => uint) public tokensEmitted;
    // Check the tokens of specific quarter is minted.
    mapping (address => mapping(uint => bool)) isMinted;

    event Minted(address indexed _user, uint indexed _quarter, uint _amount);

    /** 
        @notice Contructor
     */
    constructor(address _mariposa, address[] memory _ownership, uint[] memory _basisPoint, uint[] memory _quarter, uint[] memory _percentage) {
        mariposa = IMariposa(_mariposa);
        uint ownershipLen = _ownership.length;
        require(ownershipLen == _basisPoint.length, "Vesting: length error");

        uint quarterLen = _quarter.length;
        require(quarterLen == _percentage.length, "Vesting: length error");
        for (uint i; i < ownershipLen; i ++)
            basisPoint[_ownership[i]] = _basisPoint[i];
        
        for (uint i; i < quarterLen;i ++)
            tokensEmitted[_quarter[i]] = _percentage[i];
        
    }

    /** 
        @notice Mints tokens to recipient 
        @param  _quarter  uint256 quarter
     */
    function mint(uint _quarter) 
        external
    {
        require(isMinted[msg.sender][_quarter] == false, "Vesting: already minted");
        uint mintAmount = basisPoint[msg.sender] * tokensEmitted[_quarter];
        mariposa.request(msg.sender, mintAmount);
        isMinted[msg.sender][_quarter] = true;
        emit Minted(msg.sender, _quarter, mintAmount);
    }
}

