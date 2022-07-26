// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title RewardDistributor
/// @author ████

/**
    @notice
    Adapted from Hidden-Hand's RewardDistributor
*/

contract RewardDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Distribution {
        address token;
        bytes32 merkleRoot;
        bytes32 proof;
    }

    struct Reward {
        address token;
        bytes32 merkleRoot;
        bytes32 proof;
        uint256 updateCount;
    }

    struct Claim {
        address token;
        address account;
        uint256 amount;
        bytes32[] merkleProof;
    }

    // Address of the Multisig (also as the primary source of rewards)
    address public immutable MULTISIG;

    // Maps each of the token address to its reward metadata
    mapping(address => Reward) public rewards;
    // Tracks the amount of claimed reward for the specified token address + account
    mapping(address => mapping(address => uint256)) public claimed;

    event RewardClaimed(
        address indexed token,
        address indexed account,
        uint256 amount,
        uint256 updateCount
    );

    event RewardMetadataUpdated(
        address indexed token,
        bytes32 merkleRoot,
        bytes32 proof,
        uint256 indexed updateCount
    );

    constructor(address multisig) {
        require(multisig != address(0), "Invalid address");
        MULTISIG = multisig;
    }

    /**
        @notice Enables and restricts native token ingress to Multisig
     */
    receive() external payable {
        if (msg.sender != MULTISIG) revert("Not MULTISIG");
    }

    /**
        @notice Claim rewards based on the specified metadata
        @param  claims  Claim[] List of claim metadata
     */
    function claim(Claim[] calldata claims) external nonReentrant {
        require(claims.length != 0, "Invalid claims");

        for (uint256 i; i < claims.length; ++i) {
            _claim(
                claims[i].token,
                claims[i].account,
                claims[i].amount,
                claims[i].merkleProof
            );
        }
    }

    /**
        @notice Update rewards metadata
        @param  distributions  Distribution[] List of reward distribution details
     */
    function updateRewardsMetadata(Distribution[] calldata distributions)
        external
        onlyOwner
    {
        require(distributions.length != 0, "Invalid distributions");

        for (uint256 i; i < distributions.length; ++i) {
            // Update the metadata and also increment the update counter
            Distribution calldata distribution = distributions[i];
            Reward storage reward = rewards[distribution.token];
            reward.token = distribution.token;
            reward.merkleRoot = distribution.merkleRoot;
            reward.proof = distribution.proof;
            ++reward.updateCount;

            emit RewardMetadataUpdated(
                distribution.token,
                distribution.merkleRoot,
                distribution.proof,
                reward.updateCount
            );
        }
    }

    /**
        @notice Claim a reward
        @param  token        address    Token address
        @param  account      address    Eligible user account
        @param  amount       uint256    Reward amount
        @param  merkleProof  bytes32[]  Merkle proof
     */
    function _claim(
        address token,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) private {
        Reward memory reward = rewards[token];

        require(reward.merkleRoot != 0, "Distribution not enabled");

        // Verify the merkle proof
        require(
            MerkleProof.verify(
                merkleProof,
                reward.merkleRoot,
                keccak256(abi.encodePacked(account, amount))
            ),
            "Invalid proof"
        );

        // Verify the claimable amount
        require(claimed[token][account] < amount, "No claimable reward");

        // Calculate the claimable amount based off the total of reward (used in the merkle tree)
        // since the beginning for the user, minus the total claimed so far
        uint256 claimable = amount - claimed[token][account];
        // Update the claimed amount to the current total
        claimed[token][account] = amount;

        // Check whether the reward is in the form of native tokens or ERC20
        // by checking if the token address is set to the Multisig or not
        address token = reward.token;
        if (token != MULTISIG) {
            IERC20(token).safeTransfer(account, claimable);
        } else {
            (bool sent, ) = payable(account).call{value: claimable}("");
            require(sent, "Failed to transfer to account");
        }

        emit RewardClaimed(
            token,
            account,
            claimable,
            reward.updateCount
        );
    }
}
