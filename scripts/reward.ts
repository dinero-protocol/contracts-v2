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
  RewardDistributor,
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

// TODO: Should replace with mainnet values on production
const rlBtrflyAddress = '0x742B70151cd3Bc7ab598aAFF1d54B90c3ebC6027';
const multicallAddress = '0xeefba1e63905ef1d7acba5a8513c70307c1ce441';
const rewardDistributorAddress = '0xd7807E5752B368A6a64b76828Aaff0750522a76E';
const minBlock = 15317426; // Block for the locked balance snapshot
const maxBlock = 15361719; // Block for the relocked balance snapshot
const deadline = 1660176000; // Epoch timestamp for the current snapshot
const previousDeadline = 0; // Epoch timestamp for the previous snapshot

// Used for storing cached distribution data
const dataDir = `data`;
const currentDir = `${dataDir}/${deadline}`;
const previousDir = `${dataDir}/${previousDeadline}`;

// Replace with list of tx hashes used for sending in rewards for the current snapshot
const txHashes = [
  '0xc2d3d650696e0f7379422060cfb6d82ccfc25a0d37606e708a12af6d6b853ce5',
  '0x2e75d0f47ed803112ce1dd35e403b938b2112ad6d07a8d219baae4921631d8e8',
];
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
  const rewardDistributor = (await ethers.getContractAt(
    'RewardDistributor',
    rewardDistributorAddress
  )) as RewardDistributor;

  const multisigAddress = (await rewardDistributor.MULTISIG()).toLowerCase();

  // Get unique list of lockers from the very beginning
  const lockedEvents = await rlBtrfly.queryFilter(rlBtrfly.filters.Locked(), 0, minBlock);
  const tmpLockers: Set<string> = new Set<string>();
  lockedEvents.map(({ args }) => tmpLockers.add(args[0].toLowerCase()));
  const lockers = Array.from(tmpLockers);
  console.log(lockers.length);

  // Use multicall to get lockedBalances info for all lockers
  const lockedBalanceCalls: any = [];
  const lockCalls: any = [];
  const balanceCalls: any = [];
  lockers.forEach((account) => {
    lockedBalanceCalls.push({
      target: rlBtrflyAddress,
      callData: rlBtrfly.interface.encodeFunctionData('balanceOf', [account]),
    });
    lockCalls.push({
      target: rlBtrflyAddress,
      callData: rlBtrfly.interface.encodeFunctionData('lockedBalances', [
        account,
      ]),
    });
    balanceCalls.push({
      target: rlBtrflyAddress,
      callData: rlBtrfly.interface.encodeFunctionData('balanceOf', [account]),
    });
  });

  // Perform standard balance snapshot at the designated snapshot block
  const userInfoList: UserInfoList = {};
  const tmpCalls: any = [];
  let idx = 0;
  await Promise.each(lockedBalanceCalls, async (row, i) => {
    tmpCalls.push(row);

    if ((i > 0 && i % 100 === 0) || i === lockedBalanceCalls.length - 1) {
      const encodedData = await multicall.callStatic.aggregate(
        tmpCalls,
        { blockTag: minBlock }
      );

      encodedData.returnData.forEach((returnData) => {
        const decoded = rlBtrfly.interface.decodeFunctionResult(
          'balanceOf',
          returnData
        );
    
        const balance = decoded[0];

        userInfoList[lockers[idx]] = {
          lockedBalance: balance,
          relockedBalance: BigNumber.from(0),
          eligibleBalance: balance,
          locks: [],
        };

        idx += 1;
      });

      tmpCalls.length = 0;
    }
  });

  // Fetch locks data at the snapshot block to check relocks later
  tmpCalls.length = 0;
  idx = 0;
  await Promise.each(lockCalls, async (row, i) => {
    tmpCalls.push(row);

    if ((i > 0 && i % 100 === 0) || i === lockCalls.length - 1) {
      const encodedData = await multicall.callStatic.aggregate(
        tmpCalls,
        { blockTag: minBlock }
      );

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

        idx += 1;
      });

      tmpCalls.length = 0;
    }
  });

  // Fetch latest balance to be used for tracking potential relocks
  tmpCalls.length = 0;
  idx = 0;
  await Promise.each(balanceCalls, async (row, i) => {
    tmpCalls.push(row);

    if ((i > 0 && i % 100 === 0) || i === balanceCalls.length - 1) {
      const encodedData = await multicall.callStatic.aggregate(
        tmpCalls,
        { blockTag: maxBlock }
      );

      encodedData.returnData.forEach((returnData) => {
        const decoded = rlBtrfly.interface.decodeFunctionResult(
          'balanceOf',
          returnData
        );
        const balance = decoded[0];
        let unlockedBalance = BigNumber.from(0);
    
        userInfoList[lockers[idx]].locks.forEach((lock) => {
          if (lock.unlockTime === deadline) {
            unlockedBalance = lock.amount;
          }
        });
    
        userInfoList[lockers[idx]].relockedBalance = unlockedBalance.lt(balance)
          ? unlockedBalance
          : balance;
        userInfoList[lockers[idx]].eligibleBalance = userInfoList[
          lockers[idx]
        ].lockedBalance.add(userInfoList[lockers[idx]].relockedBalance);
    
        totalBalance = totalBalance.add(userInfoList[lockers[idx]].eligibleBalance);

        idx += 1;
      });

      tmpCalls.length = 0;
    }
  });

  console.log('Total Eligible Balance', totalBalance);

  const tokenBalances: TokenBalance = {};

  // Fetch all tx details and parse all token transfer data
  await Promise.each(txHashes, async (txHash) => {
    const tx = await provider.getTransaction(txHash);
    const events = await tx.wait();

    // Add native token transfers when available with the multisig address set as the identifier
    if (tx.value.gt(0)) {
      if (multisigAddress in tokenBalances) {
        tokenBalances[multisigAddress] = tokenBalances[multisigAddress].add(
          tx.value
        );
      } else {
        tokenBalances[multisigAddress] = tx.value;
      }
    }

    // Loop through all logs and parse all Transfer events
    events.logs.forEach((log) => {
      const token = log.address.toLowerCase();
      const hash = log.topics[0];

      if (hash === erc20TransferHash) {
        const params = new ethers.utils.Interface(erc20Abi).parseLog(log);
        const [from, to, amount] = params.args;
        console.log('Token Transfer', token, from, to, amount);

        if (token in tokenBalances) {
          tokenBalances[token] = tokenBalances[token].add(amount);
        } else {
          tokenBalances[token] = amount;
        }
      }
    });
  });

  console.log('Token Balances', tokenBalances);

  // Calculate the reward data based on users' balance ratios for the current snapshot
  const tokenUserRewards: { [token: string]: UserReward } = {};
  Object.keys(tokenBalances).forEach((token) => {
    if (!(token in tokenUserRewards)) {
      tokenUserRewards[token] = {};
    }

    Object.keys(userInfoList).forEach((account) => {
      const { eligibleBalance } = userInfoList[account];
      const amount = eligibleBalance
        .mul(tokenBalances[token])
        .div(totalBalance);

      if (amount.gt(0)) {
        tokenUserRewards[token][account] = amount.toString();
      }
    });
  });

  // Fetch previous snapshot's reward distribution data
  const skipDistribution: { [token: string]: boolean } = {};
  if (previousDeadline) {
    const tmpPreviousFiles = await fsReadDirAsync(previousDir);
    const previousFiles = tmpPreviousFiles.filter(
      (file) => path.extname(file) === '.json'
    );

    await Promise.each(previousFiles, async (file: any) => {
      const fileData = await fsReadFileAsync(`${previousDir}/${file}`);
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

    const fileName = `${currentDir}/${token}.json`;

    await fsMkdirAsync(currentDir, { recursive: true });
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
