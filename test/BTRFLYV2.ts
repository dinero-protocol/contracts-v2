import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { toBN, callAndReturnEvent, validateEvent } from './helpers';

import { BTRFLYV2 } from '../typechain';

describe('BTRFLYV2', function () {
  let admin: SignerWithAddress;
  let notAdmin: SignerWithAddress;
  let btrflyV2: BTRFLYV2;
  let zeroAddress: string;

  before(async function () {
    ({ btrflyV2, zeroAddress } = this);
    [admin, notAdmin] = await ethers.getSigners();
  });

  describe('initial state', function () {
    it('Should have initialized state variables', async function () {
      const MINTER_ROLE = await btrflyV2.MINTER_ROLE();

      expect(ethers.utils.parseBytes32String(MINTER_ROLE)).to.equal(
        'MINTER_ROLE'
      );
    });
  });

  describe('constructor', function () {
    it('Should grant admin role', async function () {
      const hasAdminRole = await btrflyV2.hasRole(
        await btrflyV2.DEFAULT_ADMIN_ROLE(),
        admin.address
      );

      expect(hasAdminRole).to.equal(true);
    });
  });

  describe('mint', function () {
    it('Should revert if caller does not have minter role', async function () {
      const minterRole = await btrflyV2.MINTER_ROLE();
      const hasMinterRole = await btrflyV2.hasRole(
        minterRole,
        notAdmin.address
      );
      const to = notAdmin.address;
      const amount = 1;

      expect(hasMinterRole).to.equal(false);
      await expect(
        btrflyV2.connect(notAdmin).mint(to, amount)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdmin.address.toLowerCase()} is missing role ${minterRole}`
      );
    });

    it('Should mint', async function () {
      const minterRole = await btrflyV2.MINTER_ROLE();

      await btrflyV2.grantRole(minterRole, notAdmin.address);

      const hasMinterRole = await btrflyV2.hasRole(
        minterRole,
        notAdmin.address
      );
      const to = notAdmin.address;
      const amount = toBN(1);
      const mintEvent = await callAndReturnEvent(
        btrflyV2.connect(notAdmin).mint,
        [to, amount]
      );

      expect(hasMinterRole).to.equal(true);

      validateEvent(mintEvent, 'Transfer(address,address,uint256)', {
        from: zeroAddress,
        to,
        amount,
      });
    });
  });

  describe('burn', function () {
    it('Should revert if caller balance is insufficient', async function () {
      const invalidAmount = (await btrflyV2.balanceOf(admin.address)).add(1);

      await expect(btrflyV2.burn(invalidAmount)).to.be.revertedWith('0x11');
    });

    it('Should burn', async function () {
      const minterRole = await btrflyV2.MINTER_ROLE();

      await btrflyV2.grantRole(minterRole, notAdmin.address);

      const hasMinterRole = await btrflyV2.hasRole(
        minterRole,
        notAdmin.address
      );
      const to = notAdmin.address;
      const amount = toBN(1);
      const mintEvent = await callAndReturnEvent(
        btrflyV2.connect(notAdmin).mint,
        [to, amount]
      );

      expect(hasMinterRole).to.equal(true);

      validateEvent(mintEvent, 'Transfer(address,address,uint256)', {
        from: zeroAddress,
        to: to,
        amount,
      });
    });
  });
});
