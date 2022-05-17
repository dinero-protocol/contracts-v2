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
    // Basis points of address, times by 1e6. Ex: 1e6 = 1%, 1e8 = 100%
    mapping (address => uint) public basisPoints;
    // Token percent to be minted in specific quarter
    mapping (uint => uint) public tokensUnlocking;
    // Check the tokens of specific quarter is minted.
    mapping (address => mapping(uint => bool)) public isMinted;

    event Minted(address indexed _user, uint indexed _quarter, uint _amount);

    /** 
        @notice Contructor
     */
    constructor(address _mariposa, address[] memory _ownerships, uint[] memory _basisPoints, uint[] memory _quarters, uint[] memory _tokensUnlocking) {
        mariposa = IMariposa(_mariposa);
        uint ownershipsLen = _ownerships.length;
        require(ownershipsLen == _basisPoints.length, "Vesting: length error");

        uint quartersLen = _quarters.length;
        require(quartersLen == _tokensUnlocking.length, "Vesting: length error");
        for (uint i; i < ownershipsLen; i ++)
            basisPoints[_ownerships[i]] = _basisPoints[i];
        
        for (uint i; i < quartersLen;i ++)
            tokensUnlocking[_quarters[i]] = _tokensUnlocking[i];
    }

    /** 
        @notice Mints tokens to recipient 
        @param  _quarter  uint256 Timestamp to mint
     */
    function mint(uint _quarter) 
        external
    {
        require(_quarter < block.timestamp, "Vesting: can not mint");
        require(isMinted[msg.sender][_quarter] == false, "Vesting: already minted");
        uint mintAmount = tokensUnlocking[_quarter] * basisPoints[msg.sender];
        mariposa.request(msg.sender, mintAmount);
        isMinted[msg.sender][_quarter] = true;
        emit Minted(msg.sender, _quarter, mintAmount);
    }
}

