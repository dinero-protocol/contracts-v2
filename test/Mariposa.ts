import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  validateEvent,
  ADDRESS_ZERO,
  toBN,
} from './helpers';
import { Mariposa } from '../typechain';
import { BTRFLYV2 } from '../typechain/BTRFLYV2';
import { BigNumber, ethers } from 'ethers';

describe('Mariposa', function () {
  let admin: SignerWithAddress;
  let notAdmin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let btrflyV2: BTRFLYV2;
  let mariposa: Mariposa;
  let mariposaSupplyCap: BigNumber;

  before(async function () {
    ({ admin, notAdmin, alice, bob, btrflyV2, mariposa, mariposaSupplyCap } =
      this);

    // Setup for Mariposa TEST
    await btrflyV2.setVault(mariposa.address);
  });

  describe('constructor', function () {
    it('Should set up contract state', async function () {
      const _btrflyV2 = await mariposa.btrfly();
      const _supplyCap = await mariposa.supplyCap();

      expect(_btrflyV2.toLowerCase()).to.equal(btrflyV2.address.toLowerCase());
      expect(_supplyCap).to.equal(mariposaSupplyCap);
    });
  });

  describe('add minter', function () {
    it('only owner can add minter', async function () {
      await expect(
        mariposa.connect(notAdmin).addMinter(notAdmin.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert if ZERO address', async function () {
      await expect(
        mariposa.connect(admin).addMinter(ADDRESS_ZERO)
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('should add minter', async function () {
      const minterEvent = await callAndReturnEvent(mariposa.addMinter, [
        notAdmin.address,
      ]);
      validateEvent(minterEvent, 'AddedMinter(address)', {
        minter: notAdmin.address,
      });
    });

    it('revert if minter already added', async function () {
      await expect(
        mariposa.connect(admin).addMinter(notAdmin.address)
      ).to.be.revertedWith('AlreadyAdded()');
    });
  });

  describe('increase allowance', function () {
    it('should revert if not owner', async function () {
      await expect(
        mariposa.connect(notAdmin).increaseAllowance(admin.address, '1')
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert if zero address', async function () {
      await expect(
        mariposa.connect(admin).increaseAllowance(ADDRESS_ZERO, '1')
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('should revert if zero amount', async function () {
      await expect(
        mariposa.connect(admin).increaseAllowance(notAdmin.address, '0')
      ).to.be.revertedWith('ZeroAmount()');
    });

    it('should revert if not minter', async function () {
      await expect(
        mariposa.connect(admin).increaseAllowance(alice.address, '1')
      ).to.be.revertedWith('NotMinter()');
    });

    it('should revert if exceeds supply cap', async function () {
      const moreThanSupplyCap = mariposaSupplyCap.add('1');
      await expect(
        mariposa
          .connect(admin)
          .increaseAllowance(notAdmin.address, moreThanSupplyCap)
      ).to.be.revertedWith('ExceedsSupplyCap()');
    });

    it('should increase allowance', async function () {
      const allowance = ethers.utils.parseEther("1000"); // 1000 tokens

      const allowanceEvent = await callAndReturnEvent(
        mariposa.increaseAllowance,
        [notAdmin.address, allowance]
      );
      validateEvent(allowanceEvent, 'IncreasedAllowance(address,uint256)', {
        minter: notAdmin.address,
        amount: allowance,
      });

      const allowanceInState = await mariposa.mintAllowances(notAdmin.address);
      const totalAllowanceInState = await mariposa.totalAllowances();

      expect(allowanceInState).to.equal(allowance);
      expect(totalAllowanceInState).to.equal(allowance);
    });
  });

  describe('decrease allowance', function () {
    it('should revert if not owner', async function () {
      await expect(
        mariposa.connect(notAdmin).decreaseAllowance(admin.address, 1)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert if zero address', async function () {
      await expect(
        mariposa.connect(admin).decreaseAllowance(ADDRESS_ZERO, '1')
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('should revert if zero amount', async function () {
      await expect(
        mariposa.connect(admin).decreaseAllowance(notAdmin.address, '0')
      ).to.be.revertedWith('ZeroAmount()');
    });

    it('should revert if not already minter', async function () {
      await expect(
        mariposa.connect(admin).decreaseAllowance(alice.address, '1')
      ).to.be.revertedWith('NotMinter()');
    });

    it('should revert if underflow on totalAllowance', async function () {
      const totalAllowances = await mariposa.totalAllowances(); // 1000 tokens
      await expect(
        mariposa
          .connect(admin)
          .decreaseAllowance(notAdmin.address, totalAllowances.add('1'))
      ).to.be.revertedWith('UnderflowAllowance()');
    });

    it('should revert if underflow on allowance', async function () {
      await mariposa.connect(admin).addMinter(alice.address);
      const allowance = ethers.utils.parseEther(toBN(1000).toString()); // 1000 tokens
      await mariposa.connect(admin).increaseAllowance(alice.address, allowance);
      const totalAllowance = await mariposa.totalAllowances();
      expect(totalAllowance).to.equal(allowance.mul(2));

      await expect(
        mariposa
          .connect(admin)
          .decreaseAllowance(notAdmin.address, totalAllowance.mul(2).add(1))
      ).to.be.revertedWith('UnderflowAllowance()');
    });

    it('should decrease allowance', async function () {
      const aliceAllowance = await mariposa.mintAllowances(alice.address);

      const allowanceEvent = await callAndReturnEvent(
        mariposa.decreaseAllowance,
        [alice.address, aliceAllowance]
      );
      validateEvent(allowanceEvent, 'DecreasedAllowance(address,uint256)', {
        minter: alice.address,
        amount: aliceAllowance,
      });

      const currentAllowance = await mariposa.mintAllowances(alice.address);
      expect(currentAllowance).to.equal('0');
    });
  });

  describe('request', function () {
    it('reverts if not minter', async function () {
      await expect(
        mariposa.connect(bob).request(bob.address, '1')
      ).to.be.revertedWith('NotMinter()');
    });

    it('reverts if address zero', async function () {
      await expect(
        mariposa.connect(notAdmin).request(ADDRESS_ZERO, '1')
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('reverts if zero amount', async function () {
      await expect(
        mariposa.connect(notAdmin).request(notAdmin.address, '0')
      ).to.be.revertedWith('ZeroAmount()');
    });

    it('reverts over allowance', async function () {
      const allowance = await mariposa.mintAllowances(notAdmin.address);
      await expect(
        mariposa.connect(notAdmin).request(notAdmin.address, allowance.add('1'))
      ).to.be.revertedWith('ExceedsAllowance()');
    });

    it('mints requested', async function () {
      const allowance = await mariposa.mintAllowances(notAdmin.address);
      expect(allowance).to.equal(
        ethers.utils.parseEther("1000")
      );
      const requestEvent = await callAndReturnEvent(
        mariposa.connect(notAdmin).request,
        [notAdmin.address, allowance]
      );

      validateEvent(requestEvent, 'Requested(address,address,uint256)', {
        minter: notAdmin.address,
        recipient: notAdmin.address,
        amount: allowance,
      });

      expect(await mariposa.emissions()).to.equal(allowance);
      expect(await mariposa.mintAllowances(notAdmin.address)).to.equal(toBN(0));
      expect(await btrflyV2.balanceOf(notAdmin.address)).to.equal(allowance);
    });
  });

  describe('shutdown', function () {
    it('should revert if not owner', async function () {
      await expect(mariposa.connect(notAdmin).shutdown()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('owner can shutdown mariposa', async function () {
      const shutdownEvent = await callAndReturnEvent(
        mariposa.connect(admin).shutdown,
        []
      );
      validateEvent(shutdownEvent, 'Shutdown()', {});
    });

    it('shut down should revert if already shutdown ', async function () {
      await expect(mariposa.connect(admin).shutdown()).to.be.revertedWith(
        'Closed()'
      );
    });

    it('should not mint if already shutdown', async function () {
      await mariposa.connect(admin).addMinter(admin.address);
      await mariposa.connect(admin).increaseAllowance(admin.address, toBN(1));

      await expect(
        mariposa.connect(admin).request(admin.address, toBN(1))
      ).to.be.revertedWith('Closed()');
    });
  });
});
