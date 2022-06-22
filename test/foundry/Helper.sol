// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import "forge-std/Test.sol";
import {BTRFLYV2} from "contracts/core/BTRFLYV2.sol";
import {Mariposa} from "contracts/core/Mariposa.sol";
import {RLBTRFLY} from "contracts/core/RLBTRFLY.sol";
import {BTRFLY as BTRFLY_CONTRACT} from "contracts/old/BTRFLY.sol";
import {wxBTRFLY as WXBTRFLY_CONTRACT} from "contracts/old/WXBTRFLY.sol";
import {xBTRFLY as XBTRFLY_CONTRACT} from "contracts/old/XBTRFLY.sol";
import {IStaking} from "contracts/interfaces/IStaking.sol";
import {TokenMigrator} from "contracts/core/TokenMigrator.sol";

contract Helper is Test {
    WXBTRFLY_CONTRACT internal constant WXBTRFLY =
        WXBTRFLY_CONTRACT(0x4B16d95dDF1AE4Fe8227ed7B7E80CF13275e61c9);
    XBTRFLY_CONTRACT internal constant XBTRFLY =
        XBTRFLY_CONTRACT(0xCC94Faf235cC5D3Bf4bEd3a30db5984306c86aBC);
    IStaking internal constant REDACTED_STAKING =
        IStaking(0xBdE4Dfb0dbb0Dd8833eFb6C5BD0Ce048C852C487);
    BTRFLY_CONTRACT internal constant BTRFLY =
        BTRFLY_CONTRACT(0xC0d4Ceb216B3BA9C3701B291766fDCbA977ceC3A);

    BTRFLYV2 internal immutable btrflyV2;
    Mariposa internal immutable mariposa;
    RLBTRFLY internal immutable rlBtrfly;
    TokenMigrator internal immutable tokenMigrator;

    constructor() {
        uint256 supplyCap = 52e23;

        btrflyV2 = new BTRFLYV2();
        mariposa = new Mariposa(address(btrflyV2), supplyCap);
        rlBtrfly = new RLBTRFLY(address(btrflyV2));

        vm.prank(0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e);

        BTRFLY.setVault(address(this));
        btrflyV2.grantRole(btrflyV2.MINTER_ROLE(), address(mariposa));
        btrflyV2.grantRole(btrflyV2.MINTER_ROLE(), address(this));

        tokenMigrator = new TokenMigrator(
            address(WXBTRFLY),
            address(XBTRFLY),
            address(btrflyV2),
            address(BTRFLY),
            address(mariposa),
            address(REDACTED_STAKING),
            address(rlBtrfly)
        );

        WXBTRFLY.approve(address(tokenMigrator), type(uint256).max);
        XBTRFLY.approve(address(tokenMigrator), type(uint256).max);
        XBTRFLY.approve(address(WXBTRFLY), type(uint256).max);
        BTRFLY.approve(address(tokenMigrator), type(uint256).max);
        BTRFLY.approve(address(WXBTRFLY), type(uint256).max);
        BTRFLY.approve(address(REDACTED_STAKING), type(uint256).max);
        mariposa.addMinter(address(tokenMigrator));
        mariposa.increaseAllowance(address(tokenMigrator), supplyCap);
    }
}
