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

        // Impersonate BTRFLY's vault in order to mint
        vm.prank(0x086C98855dF3C78C6b481b6e1D47BeF42E9aC36B);

        BTRFLY.mint(address(this), xAmount + v1Amount + wxAmountBtrfly);
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

    /**
        @notice Test migrate for each token and compare the amounts received
        @param  amount  uint256  Amount of BTRFLY for each migrate token type
     */
    function testMigrateAmountComparison(uint256 amount) external {
        vm.assume(amount != 0);
        vm.assume(amount < 100000e9);

        // Mint BTRFLY and split the tokens amongst the 3 different token types
        vm.prank(0x086C98855dF3C78C6b481b6e1D47BeF42E9aC36B);

        BTRFLY.mint(address(this), amount * 3);
        REDACTED_STAKING.stake(amount, address(this));
        REDACTED_STAKING.claim(address(this));

        // Migrate to BTRFLYV2 for each token type and track the amount received
        tokenMigrator.migrate(
            WXBTRFLY.wrapFromBTRFLY(amount),
            0,
            0,
            address(this),
            false
        );

        uint256 btrflyV2FromWx = btrflyV2.balanceOf(address(this));

        tokenMigrator.migrate(0, amount, 0, address(this), false);

        // Deduct BTRFLYV2 received from previous token type migrations
        uint256 btrflyV2FromX = btrflyV2.balanceOf(address(this)) -
            btrflyV2FromWx;

        tokenMigrator.migrate(0, 0, amount, address(this), false);

        uint256 btrflyV2FromV1 = btrflyV2.balanceOf(address(this)) -
            (btrflyV2FromWx + btrflyV2FromX);

        // BTRFLYV2 received is equal for all if their underlying BTRFLY are equal
        assertTrue(btrflyV2FromWx == btrflyV2FromX);
        assertTrue(btrflyV2FromX == btrflyV2FromV1);
    }
}
