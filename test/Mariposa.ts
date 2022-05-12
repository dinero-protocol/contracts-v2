/*

    Test setup :
    
    use hardhat mainnet forking to :
    - deploy mariposa with a cap of 5M
    - immitate dao multisig 0xA52Fd396891E7A74b641a2Cb1A6999Fcf56B077e
    - call setVault(mariposaAddress) on the btrfly contract

    tests to ensure
    - distributions are correct
    - adjustments are correct
    - requests update department budgets correctly
    - ensure unauthorised accounts CANNOT mint

*/
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  validateEvent,
  ADDRESS_ZERO
} from './helpers';
import { BTRFLY, RLBTRFLY, Mariposa } from '../typechain';
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
      expect(supplyCap).to.equal(parseUnits('5000000', 18));
    });
  });

  describe('request', function () {
    it('Should revert when called by unauthorized minter', async function () {
      await expect(mariposa.request(notAdmin.address, parseUnits('1', 18))).to.be.revertedWith('NotMinter()');
    });

    it('Should set allowance correctly', async function () {
      await expect(mariposa.setAllowance(admin.address, parseUnits('0', 18))).to.be.revertedWith('ZeroAmount()');
      await expect(mariposa.setAllowance(ADDRESS_ZERO, parseUnits('1', 18))).to.be.revertedWith('ZeroAddress()');
      await expect(mariposa.setAllowance(admin.address, parseUnits('5000001', 18))).to.be.revertedWith('ExceedsSupplyCap()');
      
      const allowanceEvent = await callAndReturnEvent(mariposa.setAllowance, [
        admin.address, parseUnits('5000000', 18)
      ]);
      validateEvent(allowanceEvent, 'AllowanceSet(address,uint256)', {
        _contract: admin.address,
        _amount: parseUnits('5000000', 18)
      });

      await expect(mariposa.setAllowance(admin.address, parseUnits('5000000', 18))).to.be.revertedWith('NoChange');
    });

    it('Should minter minting tokens to receipient', async function () {
      await expect(mariposa.request(notAdmin.address, parseUnits('0', 18))).to.be.revertedWith('ZeroAmount()');
      await expect(mariposa.request(notAdmin.address, parseUnits('5000001', 18))).to.be.revertedWith('ExceedsAllowance()');

      const requestEvent = await callAndReturnEvent(mariposa.request, [
        notAdmin.address, parseUnits('1000000', 18)
      ]);
      validateEvent(requestEvent, 'Requested(address,address,uint256)', {
        _contract: admin.address,
        _recipient: notAdmin.address,
        amount: parseUnits('1000000', 18)
      });

      expect(await btrfly.balanceOf(notAdmin.address)).to.equal(parseUnits('1000000', 18));
    });
  });

});
