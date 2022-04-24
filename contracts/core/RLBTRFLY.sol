// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {ReentrancyGuard} from "@rari-capital/solmate/src/utils/ReentrancyGuard.sol";
import {ERC20} from "@rari-capital/solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RLBTRFLY
/// @author Drahrealm

/**
    @notice 
    Partially adapted from Convex's CvxLockerV2 contract with some modifications and optimizations for the BTRFLY V2 requirements
*/

contract RLBTRFLY is ReentrancyGuard, Ownable {
    using SafeTransferLib for ERC20;

    /**
        @notice Balance details
        @param  locked           uint224  Overall locked amount
        @param  nextUnlockIndex  uint32   Index of earliest next unlock
     */
    struct Balance {
        uint224 locked;
        uint32 nextUnlockIndex;
    }

    /**
        @notice Lock balance details
        @param  amount      uint224  Locked amount in the lock
        @param  unlockTime  uint32   Unlock time of the lock
     */
    struct LockedBalance {
        uint224 amount;
        uint32 unlockTime;
    }

    /**
        @notice Epoch details
        @param  supply  uint224  Total locked supply in the epoch
        @param  date    uint32   Timestamp of the epoch
     */
    struct Epoch {
        uint224 supply;
        uint32 date;
    }

    // 1 epoch = 1 week
    uint256 public constant WEEK = 604800;
    // Full lock duration = 16 weeks
    uint256 public constant LOCK_DURATION = WEEK * 16;

    ERC20 public immutable btrfly;

    uint256 public lockedSupply;
    Epoch[] public epochs;

    mapping(address => Balance) public balances;
    mapping(address => LockedBalance[]) public userLocks;

    bool public isShutdown;

    string public constant name = "Revenue-Locked BTRFLY";
    string public constant symbol = "rlBTRFLY";
    uint8 public constant decimals = 9;

    error ZeroAddress();
    error ZeroAmount();
    error IsShutdown();
    error InvalidIndex();

    event Shutdown(uint256 timestamp);
    event Locked(
        address indexed account,
        uint256 indexed epoch,
        uint256 amount,
        bool relock
    );
    event Withdrawn(address indexed account, uint256 amount, bool relock);

    /**
        @param  _owner      address  Owner address    
        @param  _btrfly     address  BTRFLY token address
     */
    constructor(
        address _owner,
        address _btrfly
    ) {
        if (_btrfly == address(0)) revert ZeroAddress();
        btrfly = ERC20(_btrfly);

        // Setup first epoch record
        uint256 currentEpoch = (block.timestamp / WEEK) * WEEK;
        epochs.push(Epoch({supply: 0, date: uint32(currentEpoch)}));
    }

    /** 
        @notice Emergency method to shutdown the current locker contract which also force-unlock all locked tokens
     */
    function shutdown() external onlyOwner {
        if (isShutdown) revert IsShutdown();

        isShutdown = true;

        emit Shutdown(block.timestamp);
    }

    /** 
        @notice Locked balance of the specified account including those with expired locks
        @param  _account  address  Account
        @return amount    uint256  Amount
     */
    function lockedBalanceOf(address _account)
        external
        view
        returns (uint256 amount)
    {
        return balances[_account].locked;
    }

    /** 
        @notice Balance of the specified account by only including tokens in active locks
        @param  _account  address  Account
        @return amount    uint256  Amount
     */
    function balanceOf(address _account)
        external
        view
        returns (uint256 amount)
    {
        // Using storage as it's actually cheaper than allocating a new memory based variable
        LockedBalance[] storage locks = userLocks[_account];
        Balance storage userBalance = balances[_account];
        uint256 nextUnlockIndex = userBalance.nextUnlockIndex;

        amount = balances[_account].locked;

        uint256 locksLength = locks.length;

        // Skip all old records
        for (uint256 i = nextUnlockIndex; i < locksLength; ++i) {
            if (locks[i].unlockTime <= block.timestamp) {
                amount -= locks[i].amount;
            } else {
                break;
            }
        }

        // Remove amount locked in the next epoch
        uint256 currentEpoch = (block.timestamp / (WEEK)) * (WEEK);
        if (
            locksLength > 0 &&
            uint256(locks[locksLength - 1].unlockTime) - LOCK_DURATION >
            currentEpoch
        ) {
            amount -= locks[locksLength - 1].amount;
        }

        return amount;
    }

    /** 
        @notice Balance of the specified account by only including properly locked tokens at the given epoch
        @param  _epochIndex  uint256  Index of the epoch
        @param  _account     address  Account
        @return amount       uint256  Amount
     */
    function balanceAtEpochOf(uint256 _epochIndex, address _account)
        external
        view
        returns (uint256 amount)
    {
        if (_epochIndex >= epochs.length) return 0;

        LockedBalance[] storage locks = userLocks[_account];

        uint256 epochTime = epochs[_epochIndex].date;
        uint256 cutoffEpoch = epochTime - LOCK_DURATION;

        if (locks.length != 0) {
            for (uint256 i = locks.length - 1; ; ) {
                uint256 lockEpoch = uint256(locks[i].unlockTime) -
                    LOCK_DURATION;

                if (lockEpoch <= epochTime) {
                    if (lockEpoch > cutoffEpoch) {
                        amount += locks[i].amount;
                    } else {
                        // Stop now as no futher checks matter
                        break;
                    }
                }

                if (i == 0) {
                    break;
                } else {
                    --i;
                }
            }
        }

        return amount;
    }

    /** 
        @notice Pending locked amount at the specified account
        @param  _account  address  Account
        @return amount    uint256  Amount
     */
    function pendingLockOf(address _account)
        external
        view
        returns (uint256 amount)
    {
        LockedBalance[] storage locks = userLocks[_account];

        uint256 locksLength = locks.length;
        uint256 currentEpoch = (block.timestamp / WEEK) * WEEK;

        if (
            locksLength > 0 &&
            uint256(locks[locksLength - 1].unlockTime) - LOCK_DURATION >
            currentEpoch
        ) {
            return locks[locksLength - 1].amount;
        }

        return 0;
    }

    /** 
        @notice Total supply of all properly locked balances at the most recent and eligible epoch
        @return supply  uint256  Total supply
     */
    function totalSupply() external view returns (uint256 supply) {
        uint256 currentEpoch = (block.timestamp / WEEK) * WEEK;
        uint256 cutoffEpoch = currentEpoch - LOCK_DURATION;
        uint256 epochIndex = epochs.length;

        if (uint256(epochs[epochIndex - 1].date) > currentEpoch) {
            --epochIndex;
        }

        if (epochIndex != 0) {
            for (uint256 i = epochIndex - 1; ; ) {
                Epoch storage e = epochs[i];

                if (uint256(e.date) <= cutoffEpoch) {
                    break;
                }

                supply += e.supply;

                if (i == 0) {
                    break;
                } else {
                    --i;
                }
            }
        }

        return supply;
    }

    /** 
        @notice Total supply of all properly locked balances at the given epoch
        @param  _epochIndex  uint256  Index of the epoch
        @return supply       uint256  Total supply
     */
    function totalSupplyAtEpoch(uint256 _epochIndex)
        external
        view
        returns (uint256 supply)
    {
        if (_epochIndex >= epochs.length) return 0;

        uint256 epochStart = (uint256(epochs[_epochIndex].date) / WEEK) * WEEK;
        uint256 cutoffEpoch = epochStart - LOCK_DURATION;

        for (uint256 i = _epochIndex; ; ) {
            Epoch storage e = epochs[i];

            if (uint256(e.date) <= cutoffEpoch) {
                break;
            }

            supply += e.supply;

            if (i == 0) {
                break;
            } else {
                --i;
            }
        }

        return supply;
    }

    /** 
        @notice Find an epoch index based on the specified timestamp
        @param  _time  uint256  Timestamp
        @return epoch  uint256  Epoch index
     */
    function findEpochId(uint256 _time) external view returns (uint256 epoch) {
        uint256 max = epochs.length - 1;
        uint256 min = 0;

        _time = (_time / WEEK) * WEEK;

        // Perform binary-search for efficient epoch matching
        while (min < max) {
            uint256 mid = (min + max + 1) / 2;
            uint256 midEpochBlock = epochs[mid].date;

            if (midEpochBlock == _time) {
                return mid;
            } else if (midEpochBlock < _time) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }

        return min;
    }

    /** 
        @notice Locked balances details for the specifed account
        @param  _account    address          Account
        @return total       uint256          Total amount
        @return unlockable  uint256          Unlockable amount
        @return locked      uint256          Locked amount
        @return lockData    LockedBalance[]  List of active locks
     */
    function lockedBalances(address _account)
        external
        view
        returns (
            uint256 total,
            uint256 unlockable,
            uint256 locked,
            LockedBalance[] memory lockData
        )
    {
        LockedBalance[] storage locks = userLocks[_account];
        Balance storage userBalance = balances[_account];
        uint256 nextUnlockIndex = userBalance.nextUnlockIndex;
        uint256 idx;

        for (uint256 i = nextUnlockIndex; i < locks.length; ++i) {
            if (locks[i].unlockTime > block.timestamp) {
                if (idx == 0) {
                    lockData = new LockedBalance[](locks.length - i);
                }

                lockData[idx] = locks[i];
                locked += lockData[idx].amount;
                ++idx;
            } else {
                unlockable += locks[i].amount;
            }
        }

        return (userBalance.locked, unlockable, locked, lockData);
    }

    /** 
        @notice Total epoch count
        @return uint256  Epoch count
     */
    function epochCount() external view returns (uint256) {
        return epochs.length;
    }

    /** 
        @notice Perform epoch checkpoint when required
     */
    function checkpointEpoch() external {
        _checkpointEpoch();
    }

    /** 
        @notice Insert a new epoch if needed by filling in any gaps
     */
    function _checkpointEpoch() internal {
        // Create the new epoch in the future for new non-active locks
        uint256 nextEpoch = (block.timestamp / WEEK) * WEEK + WEEK;
        uint256 epochIndex = epochs.length;

        if (epochs[epochIndex - 1].date < nextEpoch) {
            // Fill any epoch gaps
            while (epochs[epochs.length - 1].date != nextEpoch) {
                uint256 nextEpochDate = uint256(
                    epochs[epochs.length - 1].date
                ) + WEEK;
                epochs.push(Epoch({supply: 0, date: uint32(nextEpochDate)}));
            }
        }
    }

    /** 
        @notice Locked tokens cannot be withdrawn for lockDuration and are eligible to receive stakingReward rewards
        @param  _account  address  Account
        @param  _amount   uint256  Amount
     */
    function lock(address _account, uint256 _amount) external nonReentrant {
        btrfly.safeTransferFrom(msg.sender, address(this), _amount);

        _lock(_account, _amount, false);
    }

    /** 
        @notice Perform the actual lock
        @param  _account    address  Account
        @param  _amount     uint256  Amount
        @param  _isRelock   bool     Whether should relock
     */
    function _lock(
        address _account,
        uint256 _amount,
        bool _isRelock
    ) internal {
        if (_amount == 0) revert ZeroAmount();
        if (isShutdown) revert IsShutdown();

        Balance storage balance = balances[_account];

        _checkpointEpoch();

        uint224 lockAmount = uint224(_amount);

        balance.locked += lockAmount;
        lockedSupply += lockAmount;

        uint256 lockEpoch = (block.timestamp / WEEK) * WEEK;

        if (!_isRelock) {
            lockEpoch += WEEK;
        }

        uint256 unlockTime = lockEpoch + LOCK_DURATION;
        LockedBalance[] storage locks = userLocks[_account];
        uint256 idx = locks.length;

        // If the latest user lock is smaller than this lock, add a new entry to the end of the list
        if (idx == 0 || locks[idx - 1].unlockTime < unlockTime) {
            locks.push(
                LockedBalance({
                    amount: lockAmount,
                    unlockTime: uint32(unlockTime)
                })
            );
        } else {
            // If the latest lock is further in the future, decrease the index
            // Can only happen if relocking an expired lock after creating a new lock
            if (locks[idx - 1].unlockTime > unlockTime) {
                --idx;
            }

            // If idx points to the epoch when same unlock time, update the lock amount
            // This is always true with a normal lock but maybe not with relock
            if (locks[idx - 1].unlockTime == unlockTime) {
                LockedBalance storage locked = locks[idx - 1];
                locked.amount += lockAmount;
            } else {
                // Handle the case when there's a relock performed after a lock
                // and there's no lock entry for the current epoch
                // ie. a list of locks such as "[...][older][current*][next]" but without a "current" lock
                // thus the need to insert an entry for current epoch at the 2nd to last entry
                // by copying and inserting the tail entry(next) and then overwrite the length-2 entry

                // Reset idx
                idx = locks.length;

                // Get the current last item and copy it to the end of the list
                LockedBalance storage locked = locks[idx - 1];
                locks.push(
                    LockedBalance({
                        amount: locked.amount,
                        unlockTime: locked.unlockTime
                    })
                );

                // Insert current epoch lock entry by overwriting the entry at length-2
                locked.amount = lockAmount;
                locked.unlockTime = uint32(unlockTime);
            }
        }

        uint256 epochIndex = epochs.length - 1;

        // If relock, epoch should be current and not next, thus need to decrease index to length-2
        if (_isRelock) {
            --epochIndex;
        }

        // Update epoch supply
        epochs[epochIndex].supply += lockAmount;

        emit Locked(_account, lockEpoch, _amount, _isRelock);
    }

    /** 
        @notice Withdraw all currently locked tokens where the unlock time has passed
        @param  _account      address  Account
        @param  _relock       bool     Whether should relock
        @param  _withdrawTo   address  Target receiver
     */
    function _processExpiredLocks(
        address _account,
        bool _relock,
        address _withdrawTo
    ) internal {
        // Using storage as it's actually cheaper than allocating a new memory based variable
        LockedBalance[] storage locks = userLocks[_account];
        Balance storage userBalance = balances[_account];
        uint224 locked;
        uint256 length = locks.length;

        if (isShutdown || locks[length - 1].unlockTime <= block.timestamp) {
            locked = userBalance.locked;
            userBalance.nextUnlockIndex = uint32(length);
        } else {
            // Using nextUnlockIndex to reduce the number of loops
            uint32 nextUnlockIndex = userBalance.nextUnlockIndex;

            for (uint256 i = nextUnlockIndex; i < length; ++i) {
                // Unlock time must be less or equal to time
                if (locks[i].unlockTime > block.timestamp) break;

                // Add to cumulative amounts
                locked += locks[i].amount;
                ++nextUnlockIndex;
            }

            // Update the account's next unlock index
            userBalance.nextUnlockIndex = nextUnlockIndex;
        }

        if (locked == 0) revert ZeroAmount();

        // Update user balances and total supplies
        userBalance.locked -= locked;
        lockedSupply -= locked;

        emit Withdrawn(_account, locked, _relock);

        // Relock or return to user
        if (_relock) {
            _lock(_withdrawTo, locked, true);
        } else {
            btrfly.safeTransfer(_withdrawTo, locked);
        }
    }

    /** 
        @notice Withdraw expired locks to a different address
        @param  _to  address  Target receiver
     */
    function withdrawExpiredLocksTo(address _to) external nonReentrant {
        if (_to == address(0)) revert ZeroAddress();

        _processExpiredLocks(msg.sender, false, _to);
    }

    /** 
        @notice Withdraw/relock all currently locked tokens where the unlock time has passed
        @param  _relock  bool  Whether should relock
     */
    function processExpiredLocks(bool _relock) external nonReentrant {
        _processExpiredLocks(msg.sender, _relock, msg.sender);
    }
}
