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

contract TokenMigrator{

    IWXBTRFLY immutable public wxbtrfly;
    ERC20 immutable public xbtrfly;
    ERC20 immutable public btrflyv2;
    IBTRFLYV1 immutable public btrflyv1;
    IMariposa immutable public mariposa;
    IStaking immutable public staking;
    RLBTRFLY immutable public rlBtrfly;

    error ZeroAddress();
    error ZeroAmount();

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
    ){
        if (wxbtrfly_ == address(0))    revert ZeroAddress();
        if (xbtrfly_ == address(0))     revert ZeroAddress();
        if (btrflyv2_ == address(0))    revert ZeroAddress();
        if (btrflyv1_ == address(0))    revert ZeroAddress();
        if (mariposa_ == address(0))    revert ZeroAddress();
        if (staking_ == address(0))     revert ZeroAddress();
        if (rlBtrfly_ == address(0))    revert ZeroAddress();
        wxbtrfly    = IWXBTRFLY(wxbtrfly_);
        xbtrfly     = ERC20(xbtrfly_);
        btrflyv2    = ERC20(btrflyv2_);
        btrflyv1      = IBTRFLYV1(btrflyv1_);
        mariposa    = IMariposa(mariposa_);
        staking     = IStaking(staking_);
        rlBtrfly    = RLBTRFLY(rlBtrfly_);
        xbtrfly.approve(staking_, 2**256 -1);
        btrflyv2.approve(rlBtrfly_, 2**256 -1);
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
    ) external{
        uint256 value = wxAmount_;
        value += wxbtrfly.wBTRFLYValue(xAmount_);
        value += wxbtrfly.wBTRFLYValue(v1Amount_);

        //Receive XBTRFLY
        xbtrfly.transferFrom(msg.sender,address(this),xAmount_);
        //Unstake
        staking.unstake(xAmount_, false);

        //Receive WXBTRFLY
        wxbtrfly.transferFrom(msg.sender,address(this),wxAmount_);

        //Unwraps WXBTRFLY and immediately calls burn
        btrflyv1.burn(xAmount_ + wxbtrfly.unwrapToBTRFLY(wxAmount_));

        //Using burnFrom saves gas (no transferFrom from)
        btrflyv1.burnFrom(msg.sender,v1Amount_);

        if(rl_) _mintAndLock( recipient_, value);

        //Mint wxAmount via mariposa
        else mariposa.request( recipient_, value);
    }

    /**
        @param recipient_      address     address that will receive the minted BTRFLYV2
        @param amount_          uint256     amount of BTRFLYV1 tokens to convert into BTRFLYV2     
     */
    function fromBTRFLY(address recipient_, uint256 amount_, bool rl) external{
        //calculate wx value
        uint256 value = wxbtrfly.wBTRFLYValue(amount_);
        //burnFrom (calling burnFrom directly saves gas)
        btrflyv1.burnFrom(msg.sender,amount_);

        if(rl) _mintAndLock( recipient_, value);
        //mint wxAmount via mariposa
        else mariposa.request( recipient_, value);
    }

    /**
        @param recipient_      address     address that will receive the minted BTRFLYV2
        @param amount_          uint256     amount of XBTRFLY tokens to convert into BTRFLYV2     
     */
    function fromXBTRFLY(address recipient_, uint256 amount_, bool rl) external{
        //calculate wx value
        uint256 value = wxbtrfly.wBTRFLYValue(amount_);
        //receive tokens
        xbtrfly.transferFrom(msg.sender,address(this),amount_);
        //unstake
        staking.unstake(amount_, false);
        //burn
        btrflyv1.burn(amount_);

        if(rl) _mintAndLock( recipient_, value);
        ///mint wxAmount via mariposa
        else mariposa.request(recipient_, value);
    }

    /**
        @param recipient_      address     address that will receive the minted BTRFLYV2
        @param amount_          uint256     amount of WXBTRFLY tokens to convert into BTRFLYV2     
     */
    function fromWXBTRFLY(address recipient_, uint256 amount_, bool rl) external{
        //receive tokens
        wxbtrfly.transferFrom(msg.sender,address(this),amount_);
        //unstake
        uint256 burnAmount = wxbtrfly.unwrapToBTRFLY(amount_);
        //burn
        btrflyv1.burn(burnAmount);

        if(rl) _mintAndLock( recipient_, amount_);
        ///mint wxAmount via mariposa
        else mariposa.request( recipient_, amount_);
    }

    function _mintAndLock(address recipient_, uint256 amount_) internal{
        mariposa.request( address(this), amount_);
        rlBtrfly.lock(recipient_, amount_);
    }

}