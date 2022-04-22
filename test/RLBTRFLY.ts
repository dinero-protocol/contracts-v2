import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
// import { callAndReturnEvents, validateEvent } from './helpers';
import { BTRFLY, RLBTRFLY } from '../typechain';
import { increaseBlockTimestamp, toBN } from './helpers';

describe('RLBTRFLY', function () {
  let admin: SignerWithAddress;
  let notAdmin: SignerWithAddress;
  let btrfly: BTRFLY;
  let rlBtrfly: RLBTRFLY;

  // let addressZero: string;
  let lockDuration: BigNumber;
  let week: BigNumber;

  before(async function () {
    ({ admin, notAdmin, btrfly, rlBtrfly } = this);

    // Pre-approve for easier and shorter test run
    await btrfly.approve(rlBtrfly.address, ethers.constants.MaxUint256);
  });

  describe('initial state', function () {
    it('Should have predefined state variables', async function () {
      const name = await rlBtrfly.name();
      const symbol = await rlBtrfly.symbol();
      const decimals = await rlBtrfly.decimals();
      lockDuration = await rlBtrfly.LOCK_DURATION();
      week = await rlBtrfly.WEEK();

      const weekInSeconds = 7 * 24 * 60 * 60;
      const lockDurInSeconds = weekInSeconds * 16;

      expect(name).to.equal('Revenue-Locked BTRFLY');
      expect(symbol).to.equal('rlBTRFLY');
      expect(decimals).to.equal(9);
      expect(week).to.equal(weekInSeconds);
      expect(lockDuration).to.equal(lockDurInSeconds);
    });
  });

  describe('constructor', function () {
    it('Should set up contract state', async function () {
      const _btrfly = await rlBtrfly.btrfly();
      const epochCount = await rlBtrfly.epochCount();
      const firstEpoch = await rlBtrfly.epochs(0);

      expect(_btrfly.toLowerCase()).to.equal(btrfly.address.toLowerCase());
      expect(epochCount).to.equal(1);
      expect(firstEpoch.supply).to.equal(0);
    });
  });

  describe('lock', function () {
    it('Should revert on invalid amount of BTRFLY', async function () {
      const account = admin.address;
      const lockAmount = 0;

      await expect(rlBtrfly.lock(account, lockAmount)).to.be.revertedWith(
        'ZeroAmount()'
      );
    });

    it('Should lock on valid amount of BTRFLY', async function () {
      const account = admin.address;
      const lockAmount = toBN(1e9);
      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);

      await rlBtrfly.lock(account, lockAmount);

      const { timestamp } = await ethers.provider.getBlock('latest');
      const unlockedAt = toBN(timestamp)
        .div(week)
        .mul(week)
        .add(week)
        .add(lockDuration);
      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);

      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore.sub(lockAmount));
      expect(lockedBalanceAfter).to.equal(lockedBalanceBefore.add(lockAmount));

      const { total, unlockable, locked, lockData } =
        await rlBtrfly.lockedBalances(account);

      expect(total).to.equal(lockAmount);
      expect(unlockable).to.equal(0);
      expect(locked).to.equal(lockAmount);
      expect(lockData.length).to.equal(1);
      expect(lockData[0].amount).to.equal(lockAmount);
      expect(lockData[0].unlockTime).to.equal(unlockedAt.toNumber());
    });
  });

  describe('processExpiredLocks', function () {
    it('Should revert on non-expired locks', async function () {
      await expect(rlBtrfly.processExpiredLocks(false)).to.be.revertedWith(
        'ZeroAmount()'
      );
    });

    it('Should process expired locks without relock', async function () {
      const account = admin.address;
      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const { timestamp } = await ethers.provider.getBlock('latest');
      const { unlockable, lockData } =
        await rlBtrfly.lockedBalances(account);
      const { amount, unlockTime } = lockData[0];
      const expectedUnlockable = unlockable.add(amount);

      // Simulate passing of time until the next lock expiry
      await increaseBlockTimestamp(Number(toBN(unlockTime).sub(timestamp)));

      // Process without relock
      await rlBtrfly.processExpiredLocks(false);

      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);
      const { unlockable: unlockableAfter } =
        await rlBtrfly.lockedBalances(account);

      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore.add(expectedUnlockable));
      expect(lockedBalanceAfter).to.equal(lockedBalanceBefore.sub(expectedUnlockable));
      expect(unlockableAfter).to.equal(0);
    });
  });

  describe('shutdown', function () {
    it('Should revert when called by unauthorized caller', async function () {
      await expect(rlBtrfly.connect(notAdmin).shutdown()).to.be.revertedWith(
        'UNAUTHORIZED'
      );
    });

    it('Should shutdown the contract and force-unlock all locked tokens', async function () {
      // Create a new lock for later test
      const account = admin.address;
      const lockAmount = toBN(5e9);
      await rlBtrfly.lock(account, lockAmount);

      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const btrflyBalanceBefore = await btrfly.balanceOf(account);

      // Simulate the shutdown
      await rlBtrfly.shutdown();

      // Attempt to lock, which should revert
      await expect(rlBtrfly.lock(account, toBN(1))).to.be.revertedWith(
        'IsShutdown()'
      );

      // Attempt to withdraw without any time skip
      await rlBtrfly.withdrawExpiredLocksTo(admin.address);

      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);
      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const { locked, unlockable } =
        await rlBtrfly.lockedBalances(account);

      expect(lockedBalanceAfter).to.equal(0);
      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore.add(lockedBalanceBefore));
      expect(locked).to.equal(0);
      expect(unlockable).to.equal(0);
    });

    it('Should revert when called after shutdown', async function () {
      await expect(rlBtrfly.shutdown()).to.be.revertedWith(
        'IsShutdown()'
      );
    });
  });
});
