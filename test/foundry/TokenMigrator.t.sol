// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "forge-std/Test.sol";
import {TokenMigrator} from "contracts/core/TokenMigrator.sol";
import {Helper} from "./Helper.sol";

contract TokenMigratorTest is Test, Helper {
    event Migrate(
        uint256 wxAmount,
        uint256 xAmount,
        uint256 v1Amount,
        address indexed recipient,
        bool indexed lock,
        address indexed caller
    );

    /**
        @notice Test tx reversion if recipient is zero address
     */
    function testCannotMigrateRecipientZeroAddress() external {
        uint256 tokenAmount = 1;
        address invalidRecipient = address(0);
        bool lock = true;

        vm.expectRevert(TokenMigrator.ZeroAddress.selector);
        tokenMigrator.migrate(
            tokenAmount,
            tokenAmount,
            tokenAmount,
            invalidRecipient,
            lock
        );
    }

    /**
        @notice Test migration 
        @param  wxAmount   uint256  Amount of wxBTRFLY
        @param  xAmount    uint256  Amount of xBTRFLY
        @param  v1Amount   uint256  Amount of BTRFLY
        @param  lock       bool     Whether or not to lock
     */
    function testMigrate(
        uint256 wxAmount,
        uint256 xAmount,
        uint256 v1Amount,
        bool lock
    ) external {
        vm.assume(wxAmount != 0);
        vm.assume(wxAmount < 100e18);
        vm.assume(xAmount != 0);
        vm.assume(xAmount < 100e9);
        vm.assume(v1Amount != 0);
        vm.assume(v1Amount < 100e9);

        // Must convert wxAmount to xBTRFLY/BTRFLY value for minting and approval
        uint256 wxAmountBtrfly = WXBTRFLY.xBTRFLYValue(wxAmount);

        BTRFLY.mint(address(this), xAmount + v1Amount + wxAmountBtrfly);
        BTRFLY.approve(address(WXBTRFLY), wxAmountBtrfly);
        BTRFLY.approve(address(REDACTED_STAKING), xAmount);
        WXBTRFLY.wrapFromBTRFLY(wxAmountBtrfly);
        REDACTED_STAKING.stake(xAmount, address(this));
        REDACTED_STAKING.claim(address(this));

        // Due to Solidity rounding, this amount may differ from wxAmount
        uint256 wxBalance = WXBTRFLY.balanceOf(address(this));

        vm.expectEmit(true, true, true, true, address(tokenMigrator));

        emit Migrate(
            wxBalance,
            xAmount,
            v1Amount,
            address(this),
            lock,
            address(this)
        );

        tokenMigrator.migrate(
            wxBalance,
            xAmount,
            v1Amount,
            address(this),
            lock
        );
    }
}
