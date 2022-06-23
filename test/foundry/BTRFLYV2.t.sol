// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "forge-std/Test.sol";
import {BTRFLYV2} from "contracts/core/BTRFLYV2.sol";

contract BTRFLYV2Test is Test {
    BTRFLYV2 private btrflyV2 = new BTRFLYV2();

    event Transfer(address indexed from, address indexed to, uint256 amount);

    constructor() {
        btrflyV2.grantRole(btrflyV2.MINTER_ROLE(), address(this));
    }

    /**
        @notice Test tx reversion if caller balance is less than specified amount
        @param  mintAmount  uint256  Amount of BTRFLYV2 to mint
        @param  burnAmount  uint256  Amount of BTRFLYV2 to burn
     */
    function testCannotBurnInsufficientBalance(
        uint256 mintAmount,
        uint256 burnAmount
    ) external {
        vm.assume(mintAmount > 0);
        vm.assume(mintAmount < 10e22);
        vm.assume(burnAmount > 0);
        vm.assume(burnAmount > mintAmount);

        btrflyV2.mint(address(this), mintAmount);

        vm.expectRevert(stdError.arithmeticError);
        btrflyV2.burn(burnAmount);
    }

    /**
        @notice Test burning BTRFLYV2 tokens
        @param  mintAmount  uint256  Amount of BTRFLYV2 to mint
        @param  burnAmount  uint256  Amount of BTRFLYV2 to burn
     */
    function testBurn(uint256 mintAmount, uint256 burnAmount) external {
        vm.assume(mintAmount > 0);
        vm.assume(mintAmount < 10e22);
        vm.assume(burnAmount > 0);
        vm.assume(burnAmount <= mintAmount);

        btrflyV2.mint(address(this), mintAmount);

        assertGe(btrflyV2.balanceOf(address(this)), burnAmount);

        vm.expectEmit(true, true, false, true, address(btrflyV2));

        emit Transfer(address(this), address(0), burnAmount);

        btrflyV2.burn(burnAmount);
    }
}
