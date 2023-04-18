import Promise from 'bluebird';
import checksum from 'checksum';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { BigNumber, utils } from 'ethers';

import { BalanceTree } from '../lib/merkle';
import {
  Multicall,
  Multicall__factory,
  RLBTRFLY,
  // RewardDistributor,
} from '../typechain';
import { setUserRewards } from './helpers/redis';

// Used for parsing Transfer event log via `parseLog`
const erc20Abi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'from',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'Transfer',
    type: 'event',
  },
];

const fsMkdirAsync = <(path: fs.PathLike, options: any) => void>(
  Promise.promisify(fs.mkdir)
);
const fsWriteFileAsync = <(path: fs.PathLike, data: any) => void>(
  Promise.promisify(fs.writeFile)
);
const fsReadFileAsync = <(path: fs.PathLike) => string>(
  (<unknown>Promise.promisify(fs.readFile))
);
const fsReadDirAsync = <(path: fs.PathLike) => string[]>(
  (<unknown>Promise.promisify(fs.readdir))
);

const checksumAsync = <(file: string, options: any) => void>(
  Promise.promisify(checksum.file)
);

const { MAINNET_URL, GOERLI_URL } = process.env;
const providerUrl =
  process.env.NODE_ENV !== 'production' ? GOERLI_URL : MAINNET_URL;
const provider = new ethers.providers.StaticJsonRpcProvider(providerUrl);

const rlBtrflyAddress = '0x742B70151cd3Bc7ab598aAFF1d54B90c3ebC6027';
const multicallAddress = '0xeefba1e63905ef1d7acba5a8513c70307c1ce441';
const rewardDistributorAddress = '0xd7807E5752B368A6a64b76828Aaff0750522a76E';
const btrflyV2Address = '0xc55126051b22ebb829d00368f4b12bde432de5da';
const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

// Updated for epoch #17
const curBlock = 16886553; // Block for the locked balance snapshot
const minBlock = 16836711; // Block for the locked balance snapshot (1 week before deadline)
const maxBlock = 16936361; // Block for the relocked balance snapshot (1 week after deadline)
const deadline = 1679529600; // Epoch timestamp for the current snapshot
const previousDeadline = deadline - 1209600; // Epoch timestamp for the previous snapshot
const previousBlock = 16786948; // 2 weeks before curBlock and before midnight

// Used for storing cached distribution data
const distDir = `data/dist`;
const snapshotDir = `data/snapshot`;
const currentDistDir = `${distDir}/${deadline}`;
const previousDistDir = `${distDir}/${previousDeadline}`;
const currentSnapshotDir = `${snapshotDir}`;

// Replace with list of tx hashes used for sending in rewards for the current snapshot
const txHashes = [
  '0x17882f20fde2369b1022b785fa40f9767f95bbafa947c3e6b6bb875aac1e7ab5',
];
// const ethTxHash =
//   '0xcd2b79aac5dab481f993abcddbbeed6162d1bb17b9e7bb917b163207fca738d3';

// Constant transfer event hash used to filter out all ERC20 Transfer events
const erc20TransferHash =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

type Lock = {
  amount: BigNumber;
  unlockTime: number;
};

type UserInfo = {
  locks: Lock[];
  lockedBalance: BigNumber;
  relockedBalance: BigNumber;
  eligibleBalance: BigNumber;
  unlockedBalance: BigNumber;
};

type UserInfoList = {
  [account: string]: UserInfo;
};

type TokenBalance = {
  [token: string]: BigNumber;
};

type UserReward = {
  [account: string]: string;
};

type RewardDistribution = {
  [token: string]: { account: string; amount: BigNumber }[];
};

async function main() {
  let totalBalance = BigNumber.from(0);

  const rlBtrfly = (await ethers.getContractAt(
    'RLBTRFLY',
    rlBtrflyAddress
  )) as RLBTRFLY;
  const multicall = Multicall__factory.connect(
    multicallAddress,
    provider
  ) as Multicall;
  // const rewardDistributor = (await ethers.getContractAt(
  //   'RewardDistributor',
  //   rewardDistributorAddress
  // )) as RewardDistributor;

  // const multisigAddress = (await rewardDistributor.MULTISIG()).toLowerCase();

  // Get unique list of lockers from the previous deadline
  const lockedEvents = await rlBtrfly.queryFilter(
    rlBtrfly.filters.Locked(),
    previousBlock,
    curBlock - 1
  );
  // console.log(lockedEvents.length);

  // Combine it with the previous lockers from the very beginning
  const tmpLockers: Set<string> = new Set<string>();
  lockedEvents.map(({ args }) => tmpLockers.add(args[0].toLowerCase()));

  if (previousDeadline) {
    const fileData = await fsReadFileAsync(
      `${currentSnapshotDir}/${previousDeadline}.json`
    );
    const obj = JSON.parse(fileData);

    Object.keys(obj).forEach((account) =>
      tmpLockers.add(account.toLowerCase())
    );
  }

  const lockers = Array.from(tmpLockers);
  console.log('Total Lockers', lockers.length); // Since the first epoch

  // Use multicall to get lockedBalances info for all lockers
  const lockedBalanceCalls: any = [];
  const lockCalls: any = [];
  lockers.forEach((account) => {
    lockedBalanceCalls.push({
      target: rlBtrflyAddress,
      callData: rlBtrfly.interface.encodeFunctionData('lockedBalances', [
        account,
      ]),
    });
    lockCalls.push({
      target: rlBtrflyAddress,
      callData: rlBtrfly.interface.encodeFunctionData('lockedBalances', [
        account,
      ]),
    });
  });

  // Perform standard balance snapshot at the designated minimum snapshot block (1 week before deadline)
  const userInfoList: UserInfoList = {};
  const cachedSnapshot: any = {};
  const tmpCalls: any = [];
  let idx = 0;
  console.log(lockedBalanceCalls.length);
  await Promise.each(lockedBalanceCalls, async (row, i) => {
    tmpCalls.push(row);

    if ((i > 0 && i % 50 === 0) || i === lockedBalanceCalls.length - 1) {
      await Promise.delay(500);

      const encodedData = await multicall.callStatic.aggregate(tmpCalls, {
        blockTag: minBlock,
      });

      encodedData.returnData.forEach((returnData) => {
        const decoded = rlBtrfly.interface.decodeFunctionResult(
          'lockedBalances',
          returnData
        );

        const locks: Lock[] = [];
        decoded[3].forEach((lock: any) => {
          const [amount, unlockTime] = lock;
          locks.push({ amount, unlockTime });
        });

        let unlockedBalance = BigNumber.from(0);
        let lockedBalance = BigNumber.from(0);

        locks.forEach((lock) => {
          if (lock.unlockTime === deadline) {
            unlockedBalance = lock.amount;
          } else {
            lockedBalance = lockedBalance.add(lock.amount);
          }
        });

        userInfoList[lockers[idx]] = {
          lockedBalance: lockedBalance,
          relockedBalance: BigNumber.from(0),
          eligibleBalance: lockedBalance,
          unlockedBalance: unlockedBalance,
          locks: [],
        };

        cachedSnapshot[lockers[idx]] =
          userInfoList[lockers[idx]].eligibleBalance.toString();

        totalBalance = totalBalance.add(
          userInfoList[lockers[idx]].eligibleBalance
        );

        idx += 1;
      });

      tmpCalls.length = 0;
    }
  });

  // Fetch locks data at the snapshot block to check relocks
  tmpCalls.length = 0;
  totalBalance = BigNumber.from(0);
  idx = 0;
  await Promise.each(lockCalls, async (row, i) => {
    tmpCalls.push(row);

    if ((i > 0 && i % 100 === 0) || i === lockCalls.length - 1) {
      await Promise.delay(500);

      const encodedData = await multicall.callStatic.aggregate(tmpCalls, {
        blockTag: maxBlock,
      });

      encodedData.returnData.forEach((returnData) => {
        const decoded = rlBtrfly.interface.decodeFunctionResult(
          'lockedBalances',
          returnData
        );

        const locks: Lock[] = [];
        decoded[3].forEach((lock: any) => {
          const [amount, unlockTime] = lock;
          locks.push({ amount, unlockTime });
        });

        userInfoList[lockers[idx]].locks = locks;

        // Get the smaller amount between unlocked and newly locked in the grace period
        let relockedBalance = BigNumber.from(0);
        let newLockedBalance = BigNumber.from(0);

        userInfoList[lockers[idx]].locks.forEach((lock) => {
          if (lock.unlockTime === deadline + 604800 + 16 * 604800) {
            relockedBalance = lock.amount;
          } else if (lock.unlockTime === deadline + 16 * 604800) {
            newLockedBalance = lock.amount;
          }
        });

        // Add any new lock performed right before the actual snapshot deadline
        userInfoList[lockers[idx]].lockedBalance =
          userInfoList[lockers[idx]].lockedBalance.add(newLockedBalance);

        // Check for relocks
        userInfoList[lockers[idx]].relockedBalance = userInfoList[
          lockers[idx]
        ].unlockedBalance.lt(relockedBalance)
          ? userInfoList[lockers[idx]].unlockedBalance
          : relockedBalance;

        // Eligible balance should be the sum between curently active lock at snapshot
        // plus any relock performed for unlocked balance at snapshot within 1 week
        userInfoList[lockers[idx]].eligibleBalance = userInfoList[
          lockers[idx]
        ].lockedBalance.add(userInfoList[lockers[idx]].relockedBalance);

        cachedSnapshot[lockers[idx]] =
          userInfoList[lockers[idx]].eligibleBalance.toString();

        totalBalance = totalBalance.add(
          userInfoList[lockers[idx]].eligibleBalance
        );

        idx += 1;
      });

      tmpCalls.length = 0;
    }
  });

  // Store the snapshotted eligible balances
  const fileName = `${currentSnapshotDir}/${deadline}.json`;

  await fsMkdirAsync(currentSnapshotDir, { recursive: true });
  await fsWriteFileAsync(fileName, JSON.stringify(cachedSnapshot));

  console.log('Total Eligible Balance', totalBalance.toString());

  const tokenBalances: TokenBalance = {};

  // Fetch all tx details and parse all token transfer data
  await Promise.each(txHashes, async (txHash) => {
    const tx = await provider.getTransaction(txHash);
    const events = await tx.wait();

    // Loop through all logs and parse all Transfer events
    events.logs.forEach((log) => {
      const token = log.address.toLowerCase();
      const hash = log.topics[0];
      console.log('Topics', log.topics);
      if (hash === erc20TransferHash) {
        const params = new ethers.utils.Interface(erc20Abi).parseLog(log);
        const [from, to, amount] = params.args;
        console.log('Token Transfer', token, from, to, amount);

        if (
          (token === wethAddress || token === btrflyV2Address) &&
          to.toLowerCase() === rewardDistributorAddress.toLowerCase()
        ) {
          if (token in tokenBalances) {
            tokenBalances[token] = tokenBalances[token].add(amount);
          } else {
            tokenBalances[token] = amount;
          }
        }
      }
    });
  });

  console.log('Token Balances', tokenBalances);

  // Calculate the reward data based on users' balance ratios for the current snapshot
  const tokenUserRewards: { [token: string]: UserReward } = {};
  const totalDistributed: any = {};
  Object.keys(tokenBalances).forEach((token) => {
    if (!(token in tokenUserRewards)) {
      tokenUserRewards[token] = {};
    }

    totalDistributed[token] = BigNumber.from(0);

    Object.keys(userInfoList).forEach((account) => {
      const { eligibleBalance } = userInfoList[account];
      const amount = eligibleBalance
        .mul(tokenBalances[token])
        .div(totalBalance);

      if (amount.gt(0)) {
        tokenUserRewards[token][account] = amount.toString();

        totalDistributed[token] = totalDistributed[token].add(amount);
      }
    });
  });

  console.log('Distributed', totalDistributed);

  // Fetch previous snapshot's reward distribution data
  const skipDistribution: { [token: string]: boolean } = {};
  if (previousDeadline) {
    const tmpPreviousFiles = await fsReadDirAsync(previousDistDir);
    const previousFiles = tmpPreviousFiles.filter(
      (file) => path.extname(file) === '.json'
    );

    await Promise.each(previousFiles, async (file: any) => {
      const fileData = await fsReadFileAsync(`${previousDistDir}/${file}`);
      const obj = JSON.parse(fileData);
      const token = path.parse(file).name;

      obj.forEach((row: { account: string; amount: string }) => {
        const { account: user, amount } = row;

        if (token in tokenUserRewards) {
          if (user in tokenUserRewards[token]) {
            tokenUserRewards[token][user] = BigNumber.from(
              tokenUserRewards[token][user]
            )
              .add(BigNumber.from(amount))
              .toString();
          } else {
            tokenUserRewards[token][user] = amount;
          }
        } else {
          // This token doesn't exist in the current snapshot distribution
          // so we don't need to generate a new merkle root distribution for it
          skipDistribution[token] = true;

          tokenUserRewards[token] = {
            [user]: amount,
          };
        }
      });
    });
  }

  // Populate the historical reward distribution data up to the current snapshot
  const distribution: RewardDistribution = {};
  Object.entries(tokenUserRewards).forEach(([token, rows]) => {
    if (!(token in distribution)) {
      distribution[token] = [];
    }

    Object.entries(rows).forEach(([account, amount]) => {
      distribution[token].push({
        account,
        amount: BigNumber.from(amount),
      });
    });
  });

  // console.log(distribution);

  // Generate merkle roots+proofs for all tokens and cache distribution data
  const distributorCallParams: any = [];
  const claimMetadata: any = {};
  await Promise.each(Object.keys(distribution), async (token) => {
    const hashedDistributions = new BalanceTree(distribution[token]);
    const merkleRoot = hashedDistributions.getHexRoot();

    const cachedDistribution: { account: string; amount: string }[] = [];
    distribution[token].forEach(({ account, amount }) => {
      cachedDistribution.push({
        account,
        amount: amount.toString(),
      });

      const proof = hashedDistributions.getProof(account, amount);

      const data = {
        token,
        proof,
        amount: amount.toString(),
        chainId: 1, // Fixed to mainnet for now
      };

      if (account in claimMetadata) {
        claimMetadata[account].push(data);
      } else {
        claimMetadata[account] = [data];
      }
    });

    const fileName = `${currentDistDir}/${token}.json`;

    await fsMkdirAsync(currentDistDir, { recursive: true });
    await fsWriteFileAsync(fileName, JSON.stringify(cachedDistribution));

    if (!(token in skipDistribution)) {
      const checksumHash: any = await checksumAsync(fileName, {
        algorithm: 'MD5',
      });

      const callParams = {
        token,
        merkleRoot,
        proof: utils.keccak256(utils.toUtf8Bytes(checksumHash)),
      };

      distributorCallParams.push(callParams);
    }
  });

  // Transform the calldata for multisig calls
  const transformedCallParams: any = [];
  distributorCallParams.forEach((row: any) => {
    const { token, merkleRoot, proof } = row;

    transformedCallParams.push([token, merkleRoot, proof]);
  });
  console.log('Calldata', transformedCallParams);
  console.log(Object.keys(claimMetadata).length);

  // Update the user reward records
  await Promise.each(Object.keys(claimMetadata), async (account) => {
    await setUserRewards(account, claimMetadata[account]);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
