import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  callAndReturnEvent,
  callAndReturnEvents,
  validateEvent,
} from './helpers';
import { BTRFLYV2, RLBTRFLY } from '../typechain';
import { increaseBlockTimestamp, toBN } from './helpers';

describe('RLBTRFLY', function () {
  let admin: SignerWithAddress;
  let notAdmin: SignerWithAddress;
  let btrflyV2: BTRFLYV2;
  let rlBtrfly: RLBTRFLY;

  let lockDuration: BigNumber;
  let epochDuration: BigNumber;

  before(async function () {
    ({ admin, notAdmin, btrflyV2, rlBtrfly } = this);
  });

  describe('initial state', function () {
    it('Should have predefined state variables', async function () {
      const name = await rlBtrfly.name();
      const symbol = await rlBtrfly.symbol();
      const decimals = await rlBtrfly.decimals();
      const lockedSupply = await rlBtrfly.lockedSupply();
      lockDuration = await rlBtrfly.LOCK_DURATION();
      epochDuration = toBN(await rlBtrfly.EPOCH_DURATION());

      expect(name).to.equal('Revenue-Locked BTRFLY');
      expect(symbol).to.equal('rlBTRFLY');
      expect(decimals).to.equal(18);
      expect(epochDuration).to.equal(toBN(7 * 24 * 60 * 60));
      expect(lockDuration).to.equal(epochDuration.mul(16));
      expect(lockedSupply).to.equal(0);
    });
  });

  describe('constructor', function () {
    it('Should set up contract state', async function () {
      const btrfly = await rlBtrfly.btrfly();

      expect(btrfly.toLowerCase()).to.equal(btrflyV2.address.toLowerCase());
    });
  });

  describe('getCurrentEpoch', function () {
    it('Should return the current epoch', async function () {
      const expectedCurrentEpoch = toBN(
        (await ethers.provider.getBlock('latest')).timestamp
      )
        .div(epochDuration)
        .mul(epochDuration);
      const currentEpoch = await rlBtrfly.getCurrentEpoch();

      expect(expectedCurrentEpoch).to.not.equal(0);
      expect(expectedCurrentEpoch).to.equal(currentEpoch);
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

    it('Should revert on locking for zero address', async function () {
      const account = ethers.constants.AddressZero;
      const lockAmount = toBN(1e19);

      await expect(rlBtrfly.lock(account, lockAmount)).to.be.revertedWith(
        'ZeroAddress()'
      );
    });

    it('Should lock on valid amount of BTRFLY', async function () {
      const account = admin.address;
      const lockAmount = toBN(1e9);
      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);

      const lockEvent = await callAndReturnEvent(rlBtrfly.lock, [
        account,
        lockAmount,
      ]);

      const epoch = (await rlBtrfly.getCurrentEpoch()).add(epochDuration);

      validateEvent(lockEvent, 'Locked(address,uint256,uint256)', {
        account,
        epoch,
        amount: lockAmount,
      });

      const unlockedAt = epoch.add(lockDuration);
      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
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

      const pendingLock = await rlBtrfly.pendingLockOf(account);
      expect(pendingLock).to.equal(lockAmount);
    });

    it('Should store the lock on existing lock data within the same epoch', async function () {
      const account = admin.address;
      const lockAmount = toBN(1e9);
      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);
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

      const epoch = (await rlBtrfly.getCurrentEpoch()).add(epochDuration);

      validateEvent(lockEvent, 'Locked(address,uint256,uint256)', {
        account,
        epoch,
        amount: lockAmount,
      });

      const unlockedAt = epoch.add(lockDuration);
      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
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
      await increaseBlockTimestamp(Number(epochDuration));

      const account = admin.address;
      const lockAmount = toBN(1e9);
      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);
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

      const epoch = (await rlBtrfly.getCurrentEpoch()).add(epochDuration);

      validateEvent(lockEvent, 'Locked(address,uint256,uint256)', {
        account,
        epoch,
        amount: lockAmount,
      });

      const unlockedAt = epoch.add(lockDuration);
      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
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
      const { total: totalBefore, lockData: lockDataBefore } =
        await rlBtrfly.lockedBalances(account);
      const { amount: relockAmount, unlockTime } = lockDataBefore[0];
      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);
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
      const epoch = toBN(unlockTime)
        .div(epochDuration)
        .mul(epochDuration)
        .add(epochDuration);
      const withdrawEvent = events[0];
      const lockEvent = events[1];

      validateEvent(withdrawEvent, 'Withdrawn(address,uint256,bool)', {
        account,
        amount: relockAmount,
        relock,
      });
      validateEvent(lockEvent, 'Locked(address,uint256,uint256)', {
        account,
        epoch,
        amount: relockAmount,
      });

      // Assert the order of the locks
      // The last lock should consists of both the relock and the new lock
      const { total: totalAfter, lockData: lockDataAfter } =
        await rlBtrfly.lockedBalances(account);
      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
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
      const { total, locked, unlockable, lockData } =
        await rlBtrfly.lockedBalances(account);
      const epoch = await rlBtrfly.getCurrentEpoch();

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

      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);
      const lockedBalanceBefore = await rlBtrfly.lockedBalanceOf(account);
      const { timestamp } = await ethers.provider.getBlock('latest');
      const { unlockable, lockData } = await rlBtrfly.lockedBalances(account);
      const { amount, unlockTime } = lockData[0];
      const expectedUnlockable = unlockable.add(amount);

      // Simulate passing of time until the next lock expiry
      await increaseBlockTimestamp(Number(toBN(unlockTime).sub(timestamp)));

      // Assert the unlocked amount and active locked token balance
      const { locked, unlockable: unlockableMid } =
        await rlBtrfly.lockedBalances(account);
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

      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
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

      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);
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
      const epoch = toBN(timestampAfter)
        .div(epochDuration)
        .mul(epochDuration)
        .add(epochDuration);
      const withdrawEvent = events[0];
      const lockEvent = events[1];

      validateEvent(withdrawEvent, 'Withdrawn(address,uint256,bool)', {
        account,
        amount: expectedUnlockable,
        relock,
      });
      validateEvent(lockEvent, 'Locked(address,uint256,uint256)', {
        account,
        epoch,
        amount: expectedUnlockable,
      });

      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
      const lockedBalanceAfter = await rlBtrfly.lockedBalanceOf(account);
      const { locked: lockedAfter, unlockable: unlockableAfter } =
        await rlBtrfly.lockedBalances(account);

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

      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);
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

      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
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
      const btrflyBalanceBefore = await btrflyV2.balanceOf(account);

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
      const btrflyBalanceAfter = await btrflyV2.balanceOf(account);
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

    it('Should revert when attempting to lock after shutdown', async function () {
      const account = admin.address;
      const lockAmount = toBN(1e9);

      await expect(rlBtrfly.lock(account, lockAmount)).to.be.revertedWith(
        'IsShutdown()'
      );
    });
  });
});
