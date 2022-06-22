// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import {IStaking} from "../interfaces/IStaking.sol";
import {IWXBTRFLY} from "../interfaces/IWXBTRFLY.sol";
import {IBTRFLY} from "../interfaces/IBTRFLY.sol";
import {IMariposa} from "../interfaces/IMariposa.sol";
import {RLBTRFLY} from "./RLBTRFLY.sol";

/// @title BTRFLY V1 => V2 Token Migrator
/// @author Realkinando

/**
    @notice
    Enables users to convert BTRFLY, xBTRFLY & wxBTRFLY to BTRFLYV2, at a rate based on the wxStaking Index.
    Dependent on the contract having a sufficient allowance from Mariposa.

    receives btrfly/xBtrfly/wxBtrfly --> requests wx value for recipient --> unwraps btrfly and burns
*/

contract TokenMigrator {
    using SafeTransferLib for ERC20;

    IWXBTRFLY public immutable wxBtrfly;
    ERC20 public immutable xBtrfly;
    ERC20 public immutable btrflyV2;
    IBTRFLY public immutable btrfly;
    IMariposa public immutable mariposa;
    IStaking public immutable staking;
    RLBTRFLY public immutable rlBtrfly;

    error ZeroAddress();

    event Migrate(
        uint256 wxAmount,
        uint256 xAmount,
        uint256 v1Amount,
        address indexed recipient,
        bool indexed lock,
        address indexed caller
    );

    /**
        @param wxBtrfly_  address  wxBTRFLY token address
        @param xBtrfly_   address  xBTRFLY token address
        @param btrflyV2_  address  BTRFLYV2 token address
        @param btrfly_    address  BTRFLY token address
        @param mariposa_  address  Mariposa contract address
        @param staking_   address  Staking contract address
        @param rlBtrfly_  address  rlBTRFLY token address
     */
    constructor(
        address wxBtrfly_,
        address xBtrfly_,
        address btrflyV2_,
        address btrfly_,
        address mariposa_,
        address staking_,
        address rlBtrfly_
    ) {
        if (wxBtrfly_ == address(0)) revert ZeroAddress();
        if (xBtrfly_ == address(0)) revert ZeroAddress();
        if (btrflyV2_ == address(0)) revert ZeroAddress();
        if (btrfly_ == address(0)) revert ZeroAddress();
        if (mariposa_ == address(0)) revert ZeroAddress();
        if (staking_ == address(0)) revert ZeroAddress();
        if (rlBtrfly_ == address(0)) revert ZeroAddress();

        wxBtrfly = IWXBTRFLY(wxBtrfly_);
        xBtrfly = ERC20(xBtrfly_);
        btrflyV2 = ERC20(btrflyV2_);
        btrfly = IBTRFLY(btrfly_);
        mariposa = IMariposa(mariposa_);
        staking = IStaking(staking_);
        rlBtrfly = RLBTRFLY(rlBtrfly_);

        xBtrfly.safeApprove(staking_, type(uint256).max);
        btrflyV2.safeApprove(rlBtrfly_, type(uint256).max);
    }

    /**
        @notice Migrate wxBTRFLY to BTRFLYV2
        @param  amount      uint256  Amount of wxBTRFLY to convert to BTRFLYV2
        @return mintAmount  uint256  Amount of BTRFLYV2 to mint
     */
    function _migrateWxBtrfly(uint256 amount)
        internal
        returns (uint256 mintAmount)
    {
        // Unwrap wxBTRFLY
        wxBtrfly.transferFrom(msg.sender, address(this), amount);
        wxBtrfly.unwrapToBTRFLY(amount);

        return amount;
    }

    /**
        @notice Migrate xBTRFLY to BTRFLYV2
        @param  amount      uint256  Amount of xBTRFLY to convert to BTRFLYV2
        @return mintAmount  uint256  Amount of BTRFLYV2 to mint
     */
    function _migrateXBtrfly(uint256 amount)
        internal
        returns (uint256 mintAmount)
    {
        // Unstake xBTRFLY
        xBtrfly.transferFrom(msg.sender, address(this), amount);
        staking.unstake(amount, false);

        return wxBtrfly.wBTRFLYValue(amount);
    }

    /**
        @notice Migrate BTRFLY to BTRFLYV2
        @param  amount      uint256  Amount of BTRFLY to convert to BTRFLYV2
        @return mintAmount  uint256  Amount of BTRFLYV2 to mint
     */
    function _migrateBtrfly(uint256 amount)
        internal
        returns (uint256 mintAmount)
    {
        btrfly.transferFrom(msg.sender, address(this), amount);

        return wxBtrfly.wBTRFLYValue(amount);
    }

    /**
        @notice Migrates multiple different BTRFLY token types to V2
        @param  wxAmount   uint256  Amount of wxBTRFLY
        @param  xAmount    uint256  Amount of xBTRFLY
        @param  v1Amount   uint256  Amount of BTRFLY
        @param  recipient  address  Address receiving V2 BTRFLY
        @param  lock       bool     Whether or not to lock
     */
    function migrate(
        uint256 wxAmount,
        uint256 xAmount,
        uint256 v1Amount,
        address recipient,
        bool lock
    ) external {
        if (recipient == address(0)) revert ZeroAddress();

        emit Migrate(wxAmount, xAmount, v1Amount, recipient, lock, msg.sender);

        uint256 burnAmount;
        uint256 mintAmount;

        if (wxAmount != 0) {
            burnAmount += wxBtrfly.xBTRFLYValue(wxAmount);
            mintAmount += _migrateWxBtrfly(wxAmount);
        }

        if (xAmount != 0) {
            burnAmount += xAmount;
            mintAmount += _migrateXBtrfly(xAmount);
        }

        if (v1Amount != 0) {
            burnAmount += v1Amount;
            mintAmount += _migrateBtrfly(v1Amount);
        }

        btrfly.burn(burnAmount);
        _mintBtrflyV2(mintAmount, recipient, lock);
    }

    /**
        @notice Mint BTRFLYV2 and (optionally) lock
        @param  amount     uint256  Amount of BTRFLYV2 to mint
        @param  recipient  address  Address to receive V2 BTRFLY
        @param  lock       bool     Whether or not to lock
     */
    function _mintBtrflyV2(
        uint256 amount,
        address recipient,
        bool lock
    ) internal {
        // If locking, mint BTRFLYV2 for TokenMigrator, who will lock on behalf of recipient
        mariposa.mintFor(lock ? address(this) : recipient, amount);

        if (lock) rlBtrfly.lock(recipient, amount);
    }
}
