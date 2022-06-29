// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "forge-std/Test.sol";
import {Mariposa} from "contracts/core/Mariposa.sol";
import {Helper} from "./Helper.sol";

contract MariposaTest is Test, Helper {
    event DecreasedAllowance(address indexed minter, uint256 amount);

    constructor() {
        mariposa.addMinter(address(this));
    }

    /**
        @notice Test tx reversion if caller is not owner
     */
    function testCannotDecreaseAllowanceNotOwner() external {
        address minter = address(this);
        uint256 amount = 1;

        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(address(0));

        mariposa.decreaseAllowance(minter, amount);
    }

    /**
        @notice Test tx reversion if minter has not been set
     */
    function testCannotDecreaseAllowanceNotMinter() external {
        address invalidMinter = address(0);
        uint256 amount = 1;

        assertFalse(mariposa.isMinter(invalidMinter));

        vm.expectRevert(Mariposa.NotMinter.selector);

        mariposa.decreaseAllowance(invalidMinter, amount);
    }

    /**
        @notice Test tx reversion if amount is zero
     */
    function testCannotDecreaseAllowanceZeroAmount() external {
        address minter = address(this);
        uint256 invalidAmount = 0;

        assertTrue(mariposa.isMinter(minter));

        vm.expectRevert(Mariposa.ZeroAmount.selector);

        mariposa.decreaseAllowance(minter, invalidAmount);
    }

    /**
        @notice Test decreasing allowance where amount is greater than allowance
        @param  allowanceIncrease  uint256  Minter allowance
        @param  amount             uint256  Allowance decrease amount
     */
    function testDecreaseAllowanceAmountGTAllowance(
        uint256 allowanceIncrease,
        uint256 amount
    ) external {
        vm.assume(allowanceIncrease != 0);
        vm.assume(allowanceIncrease < SUPPLY_CAP);
        vm.assume(amount > allowanceIncrease);

        address minter = address(this);

        mariposa.increaseAllowance(minter, allowanceIncrease);

        uint256 allowanceBefore = mariposa.mintAllowances(minter);

        assertEq(allowanceIncrease, allowanceBefore);
        assertGt(amount, allowanceBefore);

        uint256 totalAllowancesBefore = mariposa.totalAllowances();

        vm.expectEmit(true, false, false, true, address(mariposa));

        emit DecreasedAllowance(minter, amount);

        mariposa.decreaseAllowance(minter, amount);

        uint256 totalAllowancesAfter = mariposa.totalAllowances();
        uint256 allowanceAfter = mariposa.mintAllowances(minter);

        assertEq(totalAllowancesAfter, totalAllowancesBefore - allowanceBefore);
        assertEq(allowanceAfter, 0);
    }

    /**
        @notice Test decreasing allowance where allowance is greater than or equal to amount
        @param  allowanceIncrease  uint256  Minter allowance
        @param  amount             uint256  Allowance decrease amount
     */
    function testDecreaseAllowanceAllowanceGTEAmount(
        uint256 allowanceIncrease,
        uint256 amount
    ) external {
        vm.assume(allowanceIncrease != 0);
        vm.assume(allowanceIncrease < SUPPLY_CAP);
        vm.assume(amount != 0);
        vm.assume(amount <= allowanceIncrease);

        address minter = address(this);

        mariposa.increaseAllowance(minter, allowanceIncrease);

        uint256 allowanceBefore = mariposa.mintAllowances(minter);

        assertEq(allowanceIncrease, allowanceBefore);
        assertGe(allowanceBefore, amount);

        uint256 totalAllowancesBefore = mariposa.totalAllowances();

        vm.expectEmit(true, false, false, true, address(mariposa));

        emit DecreasedAllowance(minter, amount);

        mariposa.decreaseAllowance(minter, amount);

        uint256 totalAllowancesAfter = mariposa.totalAllowances();
        uint256 allowanceAfter = mariposa.mintAllowances(minter);

        assertEq(totalAllowancesAfter, totalAllowancesBefore - amount);
        assertEq(allowanceAfter, allowanceBefore - amount);
    }
}
