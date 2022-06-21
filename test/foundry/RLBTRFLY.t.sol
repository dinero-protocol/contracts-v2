// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "forge-std/Test.sol";
import {RLBTRFLY} from "contracts/core/RLBTRFLY.sol";
import {Helper} from "./Helper.sol";

contract RLBTRFLYTest is Test, Helper {
    constructor() {
        btrflyV2.approve(address(rlBtrfly), type(uint256).max);
    }

    /**
        @notice Test tx reversion if account is zero address
     */
    function testCannotLockZeroAddress() external {
        address invalidAccount = address(0);
        uint256 amount = 1;

        btrflyV2.mint(address(this), amount);

        vm.expectRevert(RLBTRFLY.ZeroAddress.selector);
        rlBtrfly.lock(invalidAccount, amount);
    }

    /**
        @notice Test tx reversion if amount is zero
     */
    function testCannotLockZeroAmount() external {
        address account = address(this);
        uint256 invalidAmount = 0;

        vm.expectRevert(RLBTRFLY.ZeroAmount.selector);
        rlBtrfly.lock(account, invalidAmount);
    }

    /**
        @notice Test tx reversion if amount is zero
     */
    function testCannotLockInvalidNumber() external {
        address account = address(this);
        uint256 invalidAmount = uint256(type(uint224).max) + 1;

        btrflyV2.mint(address(this), invalidAmount);

        vm.expectRevert(
            abi.encodeWithSelector(
                RLBTRFLY.InvalidNumber.selector,
                invalidAmount
            )
        );
        rlBtrfly.lock(account, invalidAmount);
    }
}
