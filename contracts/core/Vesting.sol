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
    mapping (address => uint32) public basisPoints;
    // Token percent to be minted in specific quarter
    mapping (uint => uint) public tokensUnlocking;
    // Check the tokens of specific quarter is minted.
    mapping (address => mapping(uint => bool)) public isMinted;

    event Minted(address indexed _user, uint indexed _quarter, uint _amount);
    event RemovedAlloc(address _user);
    event AssignedAlloc(address _user, uint32 _basePoint);
    event UpdatedTokensUnlocking(uint _quarter, uint _tokensUnlocking);
    
    /** 
        @notice Contructor
        @param  _ownerships  address[] Address array of ownership
        @param  _basisPoints  uint256[] Basis point array of each address
        @param  _quarters  uint256[] Quarter timestamp array
        @param  _tokensUnlocking  uint32[] Tokens to be unlocked
     */
    constructor(address _mariposa, address[] memory _ownerships, uint32[] memory _basisPoints, uint[] memory _quarters, uint[] memory _tokensUnlocking) {
        mariposa = IMariposa(_mariposa);
        uint ownershipsLen = _ownerships.length;
        require(ownershipsLen == _basisPoints.length, "Vesting: length error");

        uint quartersLen = _quarters.length;
        require(quartersLen == _tokensUnlocking.length, "Vesting: length error");
        uint32 basePointsSum;
        for (uint i; i < ownershipsLen; i ++) {
            basisPoints[_ownerships[i]] = _basisPoints[i];
            basePointsSum += _basisPoints[i];
        }
        
        require(basePointsSum == 1e8, "Vesting: checksum error");

        for (uint i; i < quartersLen;i ++)
            tokensUnlocking[_quarters[i]] = _tokensUnlocking[i];
    }

    /** 
        @notice Mints tokens to recipient 
        @param  _quarter  uint256 Quarter timestamp to mint
     */
    function mint(uint _quarter) 
        external
    {
        require(_quarter > 0 &&_quarter < block.timestamp, "Vesting: can not mint");
        require(isMinted[msg.sender][_quarter] == false, "Vesting: already minted");
        uint mintAmount = tokensUnlocking[_quarter] * basisPoints[msg.sender];
        isMinted[msg.sender][_quarter] = true;
        mariposa.request(msg.sender, mintAmount);
        emit Minted(msg.sender, _quarter, mintAmount);
    }

    /** 
        @notice Remove basis point of user
        @param  _user  uint256 Address to be removed
     */
    function removeAlloc(address _user) external onlyOwner {
        basisPoints[address(this)] += basisPoints[_user];
        basisPoints[_user] = 0;
        emit RemovedAlloc(_user);
    }

    /** 
        @notice Assign basis point of user
        @param  _user  uint256 Address to be assigned
        @param  _basisPoint  uint256 Basis point
     */
    function assignAlloc(address _user, uint32 _basisPoint) external onlyOwner {
        uint32 prevAlloc = basisPoints[_user];
        uint32 unAlloc = getUnalloc();
        require(unAlloc + prevAlloc - _basisPoint >= 0, "Vesting: basis point overflow");
        basisPoints[_user] = _basisPoint;
        basisPoints[address(this)] = unAlloc + prevAlloc - _basisPoint;
        emit AssignedAlloc(_user, _basisPoint);
    }

    /** 
        @notice Update tokens to be unlocked
        @param  _quarter  uint256 Quarter timestamp 
        @param  _tokensUnlocking  uint256 Tokens to be unlocked
     */
    function updateTokensUnlocking(uint _quarter, uint _tokensUnlocking) external onlyOwner {
        require(_quarter > 0, "Vesting: zero quarter");
        tokensUnlocking[_quarter] = _tokensUnlocking;
        emit UpdatedTokensUnlocking(_quarter, _tokensUnlocking);
    }

    /** 
        @notice Get Unalloc point 
     */
    function getUnalloc() public view returns (uint32) {
        return basisPoints[address(this)];
    }
}

