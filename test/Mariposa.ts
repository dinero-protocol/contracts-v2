import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  validateEvent,
  ADDRESS_ZERO
} from './helpers';
import { BTRFLY, Mariposa } from '../typechain';
const { parseUnits } = ethers.utils;


describe('Mariposa', function () {
  let admin: SignerWithAddress;
  let notAdmin: SignerWithAddress;
  let btrfly: BTRFLY;
  let mariposa: Mariposa;

  before(async function () {
    ({ admin, notAdmin, btrfly, mariposa } = this);
  });

  describe('constructor', function () {
    it('Should set up contract state', async function () {
      const _btrfly = await mariposa.btrfly();
      const supplyCap = await mariposa.supplyCap();

      expect(_btrfly.toLowerCase()).to.equal(btrfly.address.toLowerCase());
      expect(supplyCap).to.equal(parseUnits('5000000', 9));
    });
  });

  describe('request', function () {
    it('Should set allowance correctly', async function () {
      await expect(mariposa.request(notAdmin.address, parseUnits('1', 9))).to.be.revertedWith('NotMinter()');
      await expect(mariposa.setAllowance(admin.address, parseUnits('0', 9))).to.be.revertedWith('ZeroAmount()');
      await expect(mariposa.setAllowance(ADDRESS_ZERO, parseUnits('1', 9))).to.be.revertedWith('ZeroAddress()');
      await expect(mariposa.setAllowance(admin.address, parseUnits('5000001', 9))).to.be.revertedWith('ExceedsSupplyCap()');
      
      const allowanceEvent = await callAndReturnEvent(mariposa.setAllowance, [
        admin.address, parseUnits('5000000', 9)
      ]);
      validateEvent(allowanceEvent, 'AllowanceSet(address,uint256)', {
        _contract: admin.address,
        _amount: parseUnits('5000000', 9)
      });
      expect(await mariposa.mintAllowances(admin.address)).to.equal(parseUnits('5000000', 9))

      await expect(mariposa.setAllowance(admin.address, parseUnits('5000000', 9))).to.be.revertedWith('NoChange');
    });

    it('Should minter minting tokens to recipient', async function () {
      await expect(mariposa.request(notAdmin.address, '0')).to.be.revertedWith('ZeroAmount()');
      await expect(mariposa.request(notAdmin.address, parseUnits('5000001', 9))).to.be.revertedWith('ExceedsAllowance()');

      const requestEvent = await callAndReturnEvent(mariposa.request, [
        notAdmin.address, parseUnits('1000000', 9)
      ]);
      validateEvent(requestEvent, 'Requested(address,address,uint256)', {
        _contract: admin.address,
        _recipient: notAdmin.address,
        amount: parseUnits('1000000', 9)
      });

      expect(await mariposa.emissions()).to.equal(parseUnits('1000000', 9))
      expect(await mariposa.mintAllowances(admin.address)).to.equal(parseUnits('4000000', 9))

      expect(await btrfly.balanceOf(notAdmin.address)).to.equal(parseUnits('1000000', 9));
    });

    it('Should revert if allowance amount is greater than supply cap', async function () {
      await expect(mariposa.setAllowance(admin.address, parseUnits('1', 0))).to.be.revertedWith('ExceedsSupplyCap');
    })

    it('Should shutdown the contract and revert if request function is called.', async function () {
      const shutdownEvent = await callAndReturnEvent(mariposa.shutdown, []);

      validateEvent(shutdownEvent, 'Shutdown()', {});

      await expect(mariposa.request(notAdmin.address, parseUnits('1000000', 9))).to.be.revertedWith(
        'Closed()'
      );
    })

    it('Should revert when called after shutdown', async function () {
      await expect(mariposa.shutdown()).to.be.revertedWith('Closed()');
    });
  });

});
