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
        @param wxAmount    uint256     amount of wxBTRFLY (in wei units) to migrate
        @param xAmount     uint256     amount of xBTRFLY (in wei units) to migrate
        @param v1Amount    uint256     amount of V1 vanilla BTRFLY (in wei units) to migrate
        @param recipient   address     address to recieve V2 BTRFLY
        @param rl          bool        whether to revenue lock newly minted V2 BTRFLY
     */
    function migrate(
        uint256 wxAmount,
        uint256 xAmount,
        uint256 v1Amount,
        address recipient,
        bool rl
    ) external returns (uint256 value) {
        if (recipient == address(0)) revert ZeroAddress();

        value = wxAmount;
        value += wxbtrfly.wBTRFLYValue(xAmount);
        value += wxbtrfly.wBTRFLYValue(v1Amount);

        if (value == 0) revert ZeroAmount();

        if (xAmount > 0) {
            //Receive XBTRFLY
            xbtrfly.transferFrom(msg.sender, address(this), xAmount);
            //Unstake
            staking.unstake(xAmount, false);
        }

        //Receive WXBTRFLY
        if (wxAmount > 0)
            wxbtrfly.transferFrom(msg.sender, address(this), wxAmount);

        //Unwraps WXBTRFLY and immediately calls burn
        if (xAmount > 0 || wxAmount > 0)
            btrflyv1.burn(xAmount + wxbtrfly.unwrapToBTRFLY(wxAmount));

        //Using burnFrom saves gas (no transferFrom from)
        if (v1Amount > 0) btrflyv1.burnFrom(msg.sender, v1Amount);

        if (rl)
            _mintAndLock(recipient, value);

            //Mint wxAmount via mariposa
        else mariposa.request(recipient, value);

        emit Migrate(recipient, msg.sender, rl, value);
    }

    /**
        @param recipient    address     address to recieve RLBTRFLY
        @param amount       uint256     amount of BTRFLYV2 to lock (in wei units)
     */
    function _mintAndLock(address recipient, uint256 amount) internal {
        mariposa.request(address(this), amount);
        rlBtrfly.lock(recipient, amount);
    }
    
}
