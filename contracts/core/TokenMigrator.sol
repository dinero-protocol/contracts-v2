// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
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
    IWXBTRFLY public immutable wxBtrfly;
    ERC20 public immutable xBtrfly;
    ERC20 public immutable btrflyV2;
    IBTRFLY public immutable btrfly;
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

        xBtrfly.approve(staking_, type(uint256).max);
        btrflyV2.approve(rlBtrfly_, type(uint256).max);
    }

    /**
        @param wxAmount    uint256     Amount of wxBTRFLY (in wei units) to migrate
        @param xAmount     uint256     Amount of xBTRFLY (in wei units) to migrate
        @param v1Amount    uint256     Amount of V1 vanilla BTRFLY (in wei units) to migrate
        @param recipient   address     Address to recieve V2 BTRFLY
        @param rl          bool        Whether to revenue lock newly minted V2 BTRFLY
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
        value += wxBtrfly.wBTRFLYValue(xAmount);
        value += wxBtrfly.wBTRFLYValue(v1Amount);

        if (value == 0) revert ZeroAmount();

        if (xAmount > 0) {
            //Receive XBTRFLY
            xBtrfly.transferFrom(msg.sender, address(this), xAmount);
            //Unstake
            staking.unstake(xAmount, false);
        }

        //Receive WXBTRFLY
        if (wxAmount > 0)
            wxBtrfly.transferFrom(msg.sender, address(this), wxAmount);

        //Unwraps WXBTRFLY and immediately calls burn
        if (xAmount > 0 || wxAmount > 0)
            btrfly.burn(xAmount + wxBtrfly.unwrapToBTRFLY(wxAmount));

        //Using burnFrom saves gas (no transferFrom from)
        if (v1Amount > 0) btrfly.burnFrom(msg.sender, v1Amount);

        if (rl)
            _mintAndLock(recipient, value);

            //Mint wxAmount via mariposa
        else mariposa.request(recipient, value);

        emit Migrate(recipient, msg.sender, rl, value);
    }

    /**
        @param recipient    address     Address to recieve RLBTRFLY
        @param amount       uint256     Amount of BTRFLYV2 to lock (in wei units)
     */
    function _mintAndLock(address recipient, uint256 amount) internal {
        mariposa.request(address(this), amount);
        rlBtrfly.lock(recipient, amount);
    }
}
