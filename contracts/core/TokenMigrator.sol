// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {IStaking} from "../interfaces/IStaking.sol";
import {IWXBTRFLY} from "../interfaces/IWXBTRFLY.sol";
import {IBTRFLYV1} from "../interfaces/IBTRFLYV1.sol";
import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import {IMariposa} from "../interfaces/IMariposa.sol";
import {RLBTRFLY} from "./RLBTRFLY.sol";

/// @title BTRFLY V1 => V2 Token Migrator
/// @author Realkinando

/**
    @notice 
    Enables users to convert BTRFLY, xBTRFLY & wxBTRFLY to BTRFLYV2, at a rate based on the wxStaking Index.
    Dependent on the contract having a sufficient allowance from Mariposa.

    receives btrfly/xbtrfly/wxbtrfly --> requests wx value for recipient --> unwraps btrfly and burns
*/

contract TokenMigrator {
    IWXBTRFLY public immutable wxbtrfly;
    ERC20 public immutable xbtrfly;
    ERC20 public immutable btrflyv2;
    IBTRFLYV1 public immutable btrflyv1;
    IMariposa public immutable mariposa;
    IStaking public immutable staking;
    RLBTRFLY public immutable rlBtrfly;

    error ZeroAddress();
    error ZeroAmount();

    event Migrate(
        address indexed to,
        address indexed from,
        bool indexed rl,
        uint256 value
    );

    /**
        @param wxbtrfly_    address     wxbtrfly token address
        @param xbtrfly_     address     xbtrfly token address
        @param btrflyv1_    address     btrfly token address
        @param mariposa_    address     mariposa contract address
        @param staking_     address     staking contract address
     */

    constructor(
        address wxbtrfly_,
        address xbtrfly_,
        address btrflyv2_,
        address btrflyv1_,
        address mariposa_,
        address staking_,
        address rlBtrfly_
    ) {
        if (wxbtrfly_ == address(0)) revert ZeroAddress();
        if (xbtrfly_ == address(0)) revert ZeroAddress();
        if (btrflyv2_ == address(0)) revert ZeroAddress();
        if (btrflyv1_ == address(0)) revert ZeroAddress();
        if (mariposa_ == address(0)) revert ZeroAddress();
        if (staking_ == address(0)) revert ZeroAddress();
        if (rlBtrfly_ == address(0)) revert ZeroAddress();
        wxbtrfly = IWXBTRFLY(wxbtrfly_);
        xbtrfly = ERC20(xbtrfly_);
        btrflyv2 = ERC20(btrflyv2_);
        btrflyv1 = IBTRFLYV1(btrflyv1_);
        mariposa = IMariposa(mariposa_);
        staking = IStaking(staking_);
        rlBtrfly = RLBTRFLY(rlBtrfly_);
        xbtrfly.approve(staking_, 2**256 - 1);
        btrflyv2.approve(rlBtrfly_, 2**256 - 1);
    }

    /**
        @param wxAmount_    uint256     amount of wxBTRFLY (in wei units) to migrate
        @param xAmount_     uint256     amount of xBTRFLY (in wei units) to migrate
        @param v1Amount_    uint256     amount of V1 vanilla BTRFLY (in wei units) to migrate
        @param recipient_   address     address to recieve V2 BTRFLY (in wei units)
        @param rl_          bool        whether to revenue lock newly minted V2 BTRFLY
     */
    function migrate(
        uint256 wxAmount_,
        uint256 xAmount_,
        uint256 v1Amount_,
        address recipient_,
        bool rl_
    ) external returns (uint256 value) {
        if (recipient_ == address(0)) revert ZeroAddress();

        value = wxAmount_;
        value += wxbtrfly.wBTRFLYValue(xAmount_);
        value += wxbtrfly.wBTRFLYValue(v1Amount_);

        if (value == 0) revert ZeroAmount();

        if (xAmount_ > 0) {
            //Receive XBTRFLY
            xbtrfly.transferFrom(msg.sender, address(this), xAmount_);
            //Unstake
            staking.unstake(xAmount_, false);
        }

        //Receive WXBTRFLY
        if (wxAmount_ > 0)
            wxbtrfly.transferFrom(msg.sender, address(this), wxAmount_);

        //Unwraps WXBTRFLY and immediately calls burn
        if (xAmount_ > 0 || wxAmount_ > 0)
            btrflyv1.burn(xAmount_ + wxbtrfly.unwrapToBTRFLY(wxAmount_));

        //Using burnFrom saves gas (no transferFrom from)
        if (v1Amount_ > 0) btrflyv1.burnFrom(msg.sender, v1Amount_);

        if (rl_)
            _mintAndLock(recipient_, value);

            //Mint wxAmount via mariposa
        else mariposa.request(recipient_, value);

        emit Migrate(recipient_, msg.sender, rl_, value);
    }

    function _mintAndLock(address recipient_, uint256 amount_) internal {
        mariposa.request(address(this), amount_);
        rlBtrfly.lock(recipient_, amount_);
    }
}

