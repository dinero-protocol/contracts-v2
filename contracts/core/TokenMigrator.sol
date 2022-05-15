// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {IStaking} from "../interfaces/IStaking.sol";
import {IWXBTRFLY} from "../interfaces/IWXBTRFLY.sol";
import {IBTRFLY} from "../interfaces/IBTRFLY.sol";
import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import {IMariposa} from "../interfaces/IMariposa.sol";

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
    IBTRFLY immutable public btrfly;
    IMariposa immutable public mariposa;
    IStaking immutable public staking;

    error ZeroAddress();
    error ZeroAmount();

    constructor(
        address wxbtrfly_,
        address xbtrfly_,
        address btrfly_,
        address mariposa_,
        address staking_
    ){
        if (wxbtrfly_ == address(0))    revert ZeroAddress();
        if (xbtrfly_ == address(0))     revert ZeroAddress();
        if (btrfly_ == address(0))      revert ZeroAddress();
        if (mariposa_ == address(0))    revert ZeroAddress();
        if (staking_ == address(0))     revert ZeroAddress();
        wxbtrfly    = IWXBTRFLY(wxbtrfly_);
        xbtrfly     = ERC20(xbtrfly_);
        btrfly      = IBTRFLY(btrfly_);
        mariposa    = IMariposa(mariposa_);
        staking     = IStaking(staking_);
    }

    function fromBTRFLY(address recipient_, uint256 amount_) external{
        //calculate wx value
        uint256 value = wxbtrfly.wBTRFLYValue(amount_);
        //burnFrom (calling burnFrom directly saves gas)
        btrfly.burnFrom(msg.sender,amount_);
        //mint wxAmount via mariposa
        mariposa.request( recipient_, value);
    }

    function fromXBTRFLY(address recipient_, uint256 amount_) external{
        //calculate wx value
        uint256 value = wxbtrfly.wBTRFLYValue(amount_);
        //receive tokens
        xbtrfly.transferFrom(msg.sender,address(this),amount_);
        //unstake
        staking.unstake(amount_, false);
        //burn
        btrfly.burn(amount_);
        ///mint wxAmount via mariposa
        mariposa.request(recipient_, value);
    }

    function fromWXBTRFLY(address recipient_, uint256 amount_) external{
        //receive tokens
        wxbtrfly.transferFrom(msg.sender,address(this),amount_);
        //unstake
        uint256 burnAmount = wxbtrfly.unwrapToBTRFLY(amount_);
        //burn
        btrfly.burn(burnAmount);
        ///mint wxAmount via mariposa
        mariposa.request( recipient_, amount_);
    }

    

}