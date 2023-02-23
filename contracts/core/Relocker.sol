// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import {RLBTRFLY} from "contracts/core/RLBTRFLY.sol";

library Common {
    struct Claim {
        address token;
        address account;
        uint256 amount;
        bytes32[] merkleProof;
    }
}

interface IRewardDistributor {
    function claim(Common.Claim[] calldata claims) external;
}

interface IPermit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract Relocker {
    using SafeTransferLib for ERC20;

    ERC20 public immutable btrfly;
    RLBTRFLY public immutable rlBtrfly;
    IRewardDistributor public immutable rewardDistributor;

    event Relock(address indexed account, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error PermitFailed();

    constructor(
        address _btrfly,
        address _rlBtrfly,
        address _rewardDistributor
    ) {
        if (_btrfly == address(0)) revert ZeroAddress();
        if (_rlBtrfly == address(0)) revert ZeroAddress();
        if (_rewardDistributor == address(0)) revert ZeroAddress();

        btrfly = ERC20(_btrfly);
        rlBtrfly = RLBTRFLY(_rlBtrfly);
        rewardDistributor = IRewardDistributor(_rewardDistributor);

        btrfly.approve(_rlBtrfly, type(uint256).max);
    }

    /**
        @notice Claim rewards based on the specified metadata and lock amount as rlBtrfly
        @notice Use msg.sender not account parameter since relock is explicit action
        @param  claims          Claim[]  List of claim metadata 
        @param _permitParams    permit parameters for btrfly (optional)
        @param  amount          uint256  Amount to relock, cheaper to calculate offchain
     */
    function claimAndLock(
        Common.Claim[] calldata claims,
        uint256 amount,
        bytes calldata _permitParams
    ) external {
        if (amount == 0) revert ZeroAmount();
        
        // Claim rewards
        rewardDistributor.claim(claims);

        // Use Permit to transfer tokens to contract
        _permit(_permitParams);

        // Transfer amount to contract
        btrfly.safeTransferFrom(msg.sender, address(this), amount);

        // Lock amount as rlBtrfly
        rlBtrfly.lock(msg.sender, amount);

        emit Relock(msg.sender, amount);
    }

    /**
     * @dev execute the permit according to the permit param
     * @param _permitParams data
     */
    function _permit(bytes calldata _permitParams) internal {
        if (_permitParams.length == 32 * 7) {
            (bool success, ) = address(btrfly).call(
                abi.encodePacked(IPermit.permit.selector, _permitParams)
            );
            if (!success) {
                revert PermitFailed();
            }
        }
    }
}
