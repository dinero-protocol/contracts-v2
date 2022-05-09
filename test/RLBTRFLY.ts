import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  callAndReturnEvents,
  validateEvent,
} from './helpers';
import { BTRFLY, RLBTRFLY } from '../typechain';
import { increaseBlockTimestamp, toBN } from './helpers';

describe('RLBTRFLY', function () {
  let admin: SignerWithAddress;
  let notAdmin: SignerWithAddress;
  let btrfly: BTRFLY;
  let rlBtrfly: RLBTRFLY;

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
      const totalSupply = await rlBtrfly.totalSupply();
      lockDuration = await rlBtrfly.LOCK_DURATION();
      week = await rlBtrfly.WEEK();

      const weekInSeconds = 7 * 24 * 60 * 60;
      const lockDurInSeconds = weekInSeconds * 16;

      expect(name).to.equal('Revenue-Locked BTRFLY');
      expect(symbol).to.equal('rlBTRFLY');
      expect(decimals).to.equal(9);
      expect(week).to.equal(weekInSeconds);
      expect(lockDuration).to.equal(lockDurInSeconds);
      expect(totalSupply).to.equal(0);
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

  describe('checkpointEpoch', function () {
    it('Should perform epoch checkpoint', async function () {
      const epochCountBefore = await rlBtrfly.epochCount();
      const { date: dateBefore } = await rlBtrfly.epochs(
        epochCountBefore.sub(1)
      );

      // Simulate passing of time until the next epoch
      await increaseBlockTimestamp(Number(week));

      // New epoch records will be added up to the next epoch (last + 2)
      await rlBtrfly.checkpointEpoch();

      const epochCountAfter = await rlBtrfly.epochCount();
      const { date: dateAfter } = await rlBtrfly.epochs(epochCountAfter.sub(1));

      expect(epochCountAfter).to.equal(epochCountBefore.add(2));
      expect(dateAfter).to.equal(dateBefore + Number(week.mul(2)));
    });
  });

  describe('findEpochId', function () {
    it('Should return the epoch index based on a valid timestamp', async function () {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const epoch = toBN(timestamp).div(week).mul(week);

      const epochIdx = await rlBtrfly.findEpochId(timestamp);
      const epochCount = await rlBtrfly.epochCount();
      const { date } = await rlBtrfly.epochs(epochIdx);

      expect(epochIdx).to.be.lte(epochCount.sub(1));
      expect(date).to.equal(epoch);
    });

    it('Should return the last epoch index on future timestamp', async function () {
      // Query with future timestamp 3 weeks from now
      let { timestamp } = await ethers.provider.getBlock('latest');
      timestamp = timestamp + Number(week) * 3;
      const epoch = toBN(timestamp).div(week).mul(week);

      const epochIdx = await rlBtrfly.findEpochId(timestamp);
      const epochCount = await rlBtrfly.epochCount();
      const { date } = await rlBtrfly.epochs(epochIdx);

      expect(epochIdx).to.be.lte(epochCount.sub(1));
      expect(date).to.lt(epoch);
    });

    it('Should return the first epoch index on past timestamp', async function () {
      // Query with timestamp of 1 week before the first epoch
      const { date: timestamp } = await rlBtrfly.epochs(0);
      const epoch = toBN(timestamp).sub(week).div(week).mul(week);

      const epochIdx = await rlBtrfly.findEpochId(timestamp);
      const { date } = await rlBtrfly.epochs(epochIdx);

      expect(epochIdx).to.equal(0);
      expect(date).to.gt(epoch);
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

      const lockEvent = await callAndReturnEvent(rlBtrfly.lock, [
        account,
        lockAmount,
      ]);

      const { timestamp } = await ethers.provider.getBlock('latest');
      const epoch = toBN(timestamp).div(week).mul(week).add(week);

      validateEvent(lockEvent, 'Locked(address,uint256,uint256,bool)', {
        account,
        epoch,
        amount: lockAmount,
        relock: false,
      });

      const unlockedAt = epoch.add(lockDuration);
      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);

      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore.sub(lockAmount));
      expect(lockedBalanceAfter).to.equal(lockedBalanceBefore.add(lockAmount));

      const {
        total,
        unlockable,
        locked,
        lockData,
      } = await rlBtrfly.lockedBalances(account);

      expect(total).to.equal(lockAmount);
      expect(unlockable).to.equal(0);
      expect(locked).to.equal(lockAmount);
      expect(lockData.length).to.equal(1);
      expect(lockData[0].amount).to.equal(lockAmount);
      expect(lockData[0].unlockTime).to.equal(unlockedAt.toNumber());

      const pendingLock = await rlBtrfly.pendingLockOf(account);
      expect(pendingLock).to.equal(lockAmount);
    });

    it('Should store the lock on existing lock data within the same epoch', async function () {
      const account = admin.address;
      const lockAmount = toBN(1e9);
      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const expectedTotal = lockAmount.add(lockedBalanceBefore);
      const { lockData: lockDataBefore } = await rlBtrfly.lockedBalances(
        account
      );
      // Lock index should stay the same as the current latest one
      const lockIdx = lockDataBefore.length - 1;

      const lockEvent = await callAndReturnEvent(rlBtrfly.lock, [
        account,
        lockAmount,
      ]);

      const { timestamp } = await ethers.provider.getBlock('latest');
      const epoch = toBN(timestamp).div(week).mul(week).add(week);

      validateEvent(lockEvent, 'Locked(address,uint256,uint256,bool)', {
        account,
        epoch,
        amount: lockAmount,
        relock: false,
      });

      const unlockedAt = epoch.add(lockDuration);
      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);

      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore.sub(lockAmount));
      expect(lockedBalanceAfter).to.equal(lockedBalanceBefore.add(lockAmount));

      const {
        total,
        unlockable,
        locked,
        lockData: lockDataAfter,
      } = await rlBtrfly.lockedBalances(account);

      expect(total).to.equal(expectedTotal);
      expect(lockDataAfter[lockIdx].amount).to.equal(
        lockDataBefore[lockIdx].amount.add(lockAmount)
      );
      expect(unlockable).to.equal(0);
      expect(locked).to.equal(expectedTotal);
      expect(lockDataAfter.length).to.equal(lockIdx + 1);
      expect(lockDataAfter[lockIdx].amount).to.equal(expectedTotal);
      expect(lockDataAfter[lockIdx].unlockTime).to.equal(unlockedAt.toNumber());

      const pendingLock = await rlBtrfly.pendingLockOf(account);
      expect(pendingLock).to.equal(expectedTotal);
    });

    it('Should store the lock on a new lock data for new epoch', async function () {
      // Simulate passing of time until the next epoch
      await increaseBlockTimestamp(Number(week));

      const account = admin.address;
      const lockAmount = toBN(1e9);
      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const expectedTotal = lockAmount.add(lockedBalanceBefore);
      const { lockData: lockDataBefore } = await rlBtrfly.lockedBalances(
        account
      );
      // Due to a new lock added, the new lock index should be equal to the current length of the array
      const lockIdx = lockDataBefore.length;

      const lockEvent = await callAndReturnEvent(rlBtrfly.lock, [
        account,
        lockAmount,
      ]);

      const { timestamp } = await ethers.provider.getBlock('latest');
      const epoch = toBN(timestamp).div(week).mul(week).add(week);

      validateEvent(lockEvent, 'Locked(address,uint256,uint256,bool)', {
        account,
        epoch,
        amount: lockAmount,
        relock: false,
      });

      const unlockedAt = epoch.add(lockDuration);
      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);

      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore.sub(lockAmount));
      expect(lockedBalanceAfter).to.equal(lockedBalanceBefore.add(lockAmount));

      const {
        total,
        locked,
        lockData: lockDataAfter,
      } = await rlBtrfly.lockedBalances(account);

      expect(total).to.equal(expectedTotal);
      expect(lockDataAfter[lockIdx].amount).to.equal(lockAmount);
      expect(locked).to.equal(expectedTotal);
      expect(lockDataAfter.length).to.equal(lockIdx + 1);
      expect(lockDataAfter[lockIdx].amount).to.equal(lockAmount);
      expect(lockDataAfter[lockIdx].unlockTime).to.equal(unlockedAt.toNumber());

      const pendingLock = await rlBtrfly.pendingLockOf(account);
      expect(pendingLock).to.equal(lockAmount);
    });

    it('Should properly relock after creating a new lock', async function () {
      const account = admin.address;
      const {
        total: totalBefore,
        lockData: lockDataBefore,
      } = await rlBtrfly.lockedBalances(account);
      const { amount: relockAmount, unlockTime } = lockDataBefore[0];
      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const { timestamp } = await ethers.provider.getBlock('latest');

      // Simulate passing of time until the first lock expiry
      await increaseBlockTimestamp(Number(toBN(unlockTime).sub(timestamp)));

      // Create a new lock which would be effective next epoch
      const lockAmount = toBN(5e8);
      await rlBtrfly.lock(account, lockAmount);

      // Attempt to relock the expired first lock
      const relock = true;
      const events = await callAndReturnEvents(rlBtrfly.processExpiredLocks, [
        relock,
      ]);

      // Relocking should be effective at the next epoch, just like normal locks
      const epoch = toBN(unlockTime).div(week).mul(week).add(week);
      const withdrawEvent = events[0];
      const lockEvent = events[1];

      validateEvent(withdrawEvent, 'Withdrawn(address,uint256,bool)', {
        account,
        amount: relockAmount,
        relock,
      });
      validateEvent(lockEvent, 'Locked(address,uint256,uint256,bool)', {
        account,
        epoch,
        amount: relockAmount,
        relock,
      });

      // Assert the order of the locks
      // The last lock should consists of both the relock and the new lock
      const {
        total: totalAfter,
        lockData: lockDataAfter,
      } = await rlBtrfly.lockedBalances(account);
      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lastLock = lockDataAfter[lockDataAfter.length - 1];
      const expectedUnlockForNewLock = epoch.add(lockDuration);

      expect(lastLock.amount).to.equal(lockAmount.add(relockAmount));
      expect(lastLock.unlockTime).to.equal(expectedUnlockForNewLock);
      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore.sub(lockAmount));
      expect(totalAfter).to.equal(totalBefore.add(lockAmount));

      const pendingLock = await rlBtrfly.pendingLockOf(account);
      expect(pendingLock).to.equal(lockAmount.add(relockAmount));
    });
  });

  describe('lockedBalances', function () {
    it('Should return correct balance data an account', async function () {
      const account = admin.address;
      const {
        total,
        locked,
        unlockable,
        lockData,
      } = await rlBtrfly.lockedBalances(account);
      const { timestamp } = await ethers.provider.getBlock('latest');
      const epoch = toBN(timestamp).div(week).mul(week);

      let tmpTotal = toBN(0);
      let tmpLocked = toBN(0);
      lockData.forEach((row) => {
        const { amount, unlockTime } = row;

        tmpTotal = tmpTotal.add(amount);

        if (toBN(unlockTime).gt(epoch)) {
          tmpLocked = tmpLocked.add(amount);
        }
      });

      expect(total).to.equal(tmpTotal);
      expect(locked).to.equal(tmpLocked);
      expect(unlockable).to.equal(tmpTotal.sub(tmpLocked));
    });
  });

  describe('lockedBalanceOf', function () {
    it('Should return correct balance of locked tokens of an account including those with expired locks', async function () {
      const account = admin.address;
      const { total, locked, unlockable } = await rlBtrfly.lockedBalances(
        account
      );
      const lockedBalance = await rlBtrfly.lockedBalanceOf(account);

      expect(lockedBalance).to.equal(total);
      expect(lockedBalance).to.equal(locked.add(unlockable));
    });
  });

  describe('balanceOf', function () {
    it('Should return correct balance of currently locked tokens within current epoch', async function () {
      const account = admin.address;
      const pendingLock = await rlBtrfly.pendingLockOf(account);
      const lockedBalance = await rlBtrfly.lockedBalanceOf(account);
      const balance = await rlBtrfly.balanceOf(account);

      expect(balance).to.equal(lockedBalance.sub(pendingLock));
    });
  });

  describe('balanceAtEpochOf', function () {
    it('Should return 0 on invalid epoch index', async function () {
      const epochCount = await rlBtrfly.epochCount();
      const balance = await rlBtrfly.balanceAtEpochOf(
        epochCount,
        admin.address
      );

      expect(balance).to.equal(0);
    });

    it('Should return correct balance of currently locked tokens up to the specified epoch', async function () {
      const account = admin.address;
      const epochCount = await rlBtrfly.epochCount();
      const epoch = await rlBtrfly.epochs(epochCount.sub(1));
      const { lockData } = await rlBtrfly.lockedBalances(account);
      const epochDate = toBN(epoch.date);
      const lockedBalance = await rlBtrfly.lockedBalanceOf(account);

      // Remove both to-be expired locks and future locks
      let exclude = toBN(0);
      lockData.forEach((row) => {
        const { amount, unlockTime } = row;
        const lockedAt = toBN(unlockTime).sub(lockDuration);

        if (
          lockedAt.lte(epochDate.sub(lockDuration)) ||
          lockedAt.gt(epochDate)
        ) {
          exclude = exclude.add(amount);
        }
      });

      const balance = await rlBtrfly.balanceAtEpochOf(
        epochCount.sub(1),
        account
      );

      expect(balance).to.equal(lockedBalance.sub(exclude));
    });
  });

  describe('totalSupply', function () {
    it('Should return correct current total of locked tokens within current epoch', async function () {
      // Since we only have 1 user with locked token, it should match with the user's balance
      const account = admin.address;
      const pendingLock = await rlBtrfly.pendingLockOf(account);
      const lockedBalance = await rlBtrfly.lockedBalanceOf(account);
      const totalSupply = await rlBtrfly.totalSupply();

      expect(totalSupply).to.equal(lockedBalance.sub(pendingLock));
    });
  });

  describe('totalSupplyAtEpoch', function () {
    it('Should return 0 on invalid epoch index', async function () {
      const epochCount = await rlBtrfly.epochCount();
      const totalSupply = await rlBtrfly.totalSupplyAtEpoch(epochCount);

      expect(totalSupply).to.equal(0);
    });

    it('Should return correct balance of currently locked tokens up to the specified epoch', async function () {
      // Since we only have 1 user with locked token, it would suffice to calculate and compare with the sole user's lock data
      const account = admin.address;
      const epochCount = await rlBtrfly.epochCount();
      const epoch = await rlBtrfly.epochs(epochCount.sub(1));
      const { lockData } = await rlBtrfly.lockedBalances(account);
      const epochDate = toBN(epoch.date);
      const lockedBalance = await rlBtrfly.lockedBalanceOf(account);

      // Remove both to-be expired locks and future locks
      let exclude = toBN(0);
      lockData.forEach((row) => {
        const { amount, unlockTime } = row;
        const lockedAt = toBN(unlockTime).sub(lockDuration);

        if (
          lockedAt.lte(epochDate.sub(lockDuration)) ||
          lockedAt.gt(epochDate)
        ) {
          exclude = exclude.add(amount);
        }
      });

      const totalSupply = await rlBtrfly.totalSupplyAtEpoch(epochCount.sub(1));

      expect(totalSupply).to.equal(lockedBalance.sub(exclude));
    });
  });

  describe('processExpiredLocks', function () {
    it('Should revert on non-expired locks', async function () {
      await expect(rlBtrfly.processExpiredLocks(false)).to.be.revertedWith(
        'ZeroAmount()'
      );
    });

    it('Should process expired locks without relock', async function () {
      // Create a new lock
      const account = admin.address;
      const lockAmount = toBN(1e9);
      await rlBtrfly.lock(account, lockAmount);

      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const { timestamp } = await ethers.provider.getBlock('latest');
      const { unlockable, lockData } = await rlBtrfly.lockedBalances(account);
      const { amount, unlockTime } = lockData[0];
      const expectedUnlockable = unlockable.add(amount);

      // Simulate passing of time until the next lock expiry
      await increaseBlockTimestamp(Number(toBN(unlockTime).sub(timestamp)));

      // Assert the unlocked amount and active locked token balance
      const {
        locked,
        unlockable: unlockableMid,
      } = await rlBtrfly.lockedBalances(account);
      const activeBalance = await rlBtrfly.balanceOf(account);
      const pendingLock = await rlBtrfly.pendingLockOf(account);

      expect(unlockableMid).to.equal(amount);
      expect(activeBalance).to.equal(locked.add(pendingLock));

      // Process without relock
      const events = await callAndReturnEvents(rlBtrfly.processExpiredLocks, [
        false,
      ]);
      const withdrawEvent = events[0];

      validateEvent(withdrawEvent, 'Withdrawn(address,uint256,bool)', {
        account,
        amount: expectedUnlockable,
        relock: false,
      });

      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);
      const { unlockable: unlockableAfter } = await rlBtrfly.lockedBalances(
        account
      );

      expect(btrflyBalanceAfter).to.equal(
        btrflyBalanceBefore.add(expectedUnlockable)
      );
      expect(lockedBalanceAfter).to.equal(
        lockedBalanceBefore.sub(expectedUnlockable)
      );
      expect(unlockableAfter).to.equal(0);
    });

    it('Should process expired locks with relock', async function () {
      // Create a new lock
      const account = admin.address;
      const lockAmount = toBN(1e9);
      await rlBtrfly.lock(account, lockAmount);

      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const { timestamp } = await ethers.provider.getBlock('latest');
      const { total, unlockable, lockData } = await rlBtrfly.lockedBalances(
        account
      );
      const { amount, unlockTime } = lockData[0];
      const expectedUnlockable = unlockable.add(amount);
      const expectedLocked = total;

      // Simulate passing of time until the next lock expiry
      await increaseBlockTimestamp(Number(toBN(unlockTime).sub(timestamp)));

      const { unlockable: unlockableMid } = await rlBtrfly.lockedBalances(
        account
      );

      expect(unlockableMid).to.equal(amount);

      // Process with relock
      const relock = true;
      const events = await callAndReturnEvents(rlBtrfly.processExpiredLocks, [
        relock,
      ]);

      const { timestamp: timestampAfter } = await ethers.provider.getBlock(
        'latest'
      );

      // Relocking should be effective at the next epoch, just like normal locks
      const epoch = toBN(timestampAfter).div(week).mul(week).add(week);
      const withdrawEvent = events[0];
      const lockEvent = events[1];

      validateEvent(withdrawEvent, 'Withdrawn(address,uint256,bool)', {
        account,
        amount: expectedUnlockable,
        relock,
      });
      validateEvent(lockEvent, 'Locked(address,uint256,uint256,bool)', {
        account,
        epoch,
        amount: expectedUnlockable,
        relock,
      });

      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);
      const {
        locked: lockedAfter,
        unlockable: unlockableAfter,
      } = await rlBtrfly.lockedBalances(account);

      expect(btrflyBalanceAfter).to.equal(btrflyBalanceBefore);
      expect(lockedBalanceAfter).to.equal(lockedBalanceBefore);
      expect(unlockableAfter).to.equal(0);
      expect(lockedAfter).to.equal(expectedLocked);

      const pendingLock = await rlBtrfly.pendingLockOf(account);
      expect(pendingLock).to.equal(expectedUnlockable);
    });
  });

  describe('withdrawExpiredLocksTo', function () {
    it('Should revert on non-expired locks', async function () {
      await expect(
        rlBtrfly.withdrawExpiredLocksTo(ethers.constants.AddressZero)
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('Should withdraw tokens from expired locks without relock', async function () {
      // Create a new lock
      const account = admin.address;
      const lockAmount = toBN(1e9);
      await rlBtrfly.lock(account, lockAmount);

      const btrflyBalanceBefore = await btrfly.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const { timestamp } = await ethers.provider.getBlock('latest');
      const { unlockable, lockData } = await rlBtrfly.lockedBalances(account);
      const { amount, unlockTime } = lockData[0];
      const expectedUnlockable = unlockable.add(amount);

      // Simulate passing of time until the next lock expiry
      await increaseBlockTimestamp(Number(toBN(unlockTime).sub(timestamp)));

      const { unlockable: unlockableMid } = await rlBtrfly.lockedBalances(
        account
      );

      expect(unlockableMid).to.equal(amount);

      // Process without relock
      const events = await callAndReturnEvents(
        rlBtrfly.withdrawExpiredLocksTo,
        [account]
      );
      const withdrawEvent = events[0];

      validateEvent(withdrawEvent, 'Withdrawn(address,uint256,bool)', {
        account,
        amount: expectedUnlockable,
        relock: false,
      });

      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);
      const { unlockable: unlockableAfter } = await rlBtrfly.lockedBalances(
        account
      );

      expect(btrflyBalanceAfter).to.equal(
        btrflyBalanceBefore.add(expectedUnlockable)
      );
      expect(lockedBalanceAfter).to.equal(
        lockedBalanceBefore.sub(expectedUnlockable)
      );
      expect(unlockableAfter).to.equal(0);

      const pendingLock = await rlBtrfly.pendingLockOf(account);
      expect(pendingLock).to.equal(0);
    });
  });

  describe('shutdown', function () {
    it('Should revert when called by unauthorized caller', async function () {
      await expect(rlBtrfly.connect(notAdmin).shutdown()).to.be.revertedWith(
        'Ownable: caller is not the owner'
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
      const shutdownEvent = await callAndReturnEvent(rlBtrfly.shutdown, []);

      validateEvent(shutdownEvent, 'Shutdown()', {});

      // Attempt to lock, which should revert
      await expect(rlBtrfly.lock(account, toBN(1))).to.be.revertedWith(
        'IsShutdown()'
      );

      // Attempt to withdraw without any time skip
      await rlBtrfly.withdrawExpiredLocksTo(admin.address);

      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);
      const btrflyBalanceAfter = await btrfly.balanceOf(account);
      const { locked, unlockable } = await rlBtrfly.lockedBalances(account);

      expect(lockedBalanceAfter).to.equal(0);
      expect(btrflyBalanceAfter).to.equal(
        btrflyBalanceBefore.add(lockedBalanceBefore)
      );
      expect(locked).to.equal(0);
      expect(unlockable).to.equal(0);
    });

    it('Should revert when called after shutdown', async function () {
      await expect(rlBtrfly.shutdown()).to.be.revertedWith('IsShutdown()');
    });
  });
});
