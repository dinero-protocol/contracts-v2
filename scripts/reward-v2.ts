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
import { setTmpUserRewards } from './helpers/redis';

// Used for parsing Transfer event log via `parseLog`
// const erc20Abi = [
//   {
//     anonymous: false,
//     inputs: [
//       {
//         indexed: true,
//         internalType: 'address',
//         name: 'from',
//         type: 'address',
//       },
//       {
//         indexed: true,
//         internalType: 'address',
//         name: 'to',
//         type: 'address',
//       },
//       {
//         indexed: false,
//         internalType: 'uint256',
//         name: 'amount',
//         type: 'uint256',
//       },
//     ],
//     name: 'Transfer',
//     type: 'event',
//   },
// ];

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
// const rewardDistributorAddress = '0xd7807E5752B368A6a64b76828Aaff0750522a76E';
const btrflyV2Address = '0xc55126051b22ebb829d00368f4b12bde432de5da';
const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

// Updated for epoch #19
const curBlock = 17084048; // Block for the locked balance snapshot
const maxBlock = 17133820; // Block for the relocked balance snapshot (1 week after deadline)
const deadline = 1681948800; // Epoch timestamp for the current snapshot
const previousDeadline = deadline - 1209600; // Epoch timestamp for the previous snapshot
const previousBlock = 16985956; // 2 weeks before curBlock and before midnight

// Used for storing cached distribution data
const distDir = `data/dist`;
const snapshotDir = `data/snapshot`;
const currentDistDir = `${distDir}/${deadline}`;
const previousDistDir = `${distDir}/${previousDeadline}`;
const latestDistDir = `${distDir}/latest`;
const currentSnapshotDir = `${snapshotDir}`;

const tokenSymbols = {
  [wethAddress.toLowerCase()]: 'weth',
  [btrflyV2Address.toLowerCase()]: 'btrfly',
};

// Replace with list of tx hashes used for sending in rewards for the current snapshot
// const txHashes = [
//   '0x17882f20fde2369b1022b785fa40f9767f95bbafa947c3e6b6bb875aac1e7ab5',
// ];
// const ethTxHash =
//   '0xcd2b79aac5dab481f993abcddbbeed6162d1bb17b9e7bb917b163207fca738d3';
//
// Constant transfer event hash used to filter out all ERC20 Transfer events
// const erc20TransferHash =
//   '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

type UserInfoList = {
  [account: string]: BigNumber;
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

  const { timestamp } = await provider.getBlock('latest');

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
    maxBlock - 1
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
      console.log('=====1', i, tmpCalls.length);
      await Promise.delay(500);

      const encodedData = await multicall.callStatic.aggregate(tmpCalls, {
        blockTag: curBlock,
      });

      encodedData.returnData.forEach((returnData) => {
        const decoded = rlBtrfly.interface.decodeFunctionResult(
          'lockedBalances',
          returnData
        );

        const lockedBalance: BigNumber = BigNumber.from(decoded[2]);

        userInfoList[lockers[idx]] = lockedBalance;

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
      console.log('==========2', i, tmpCalls.length);
      await Promise.delay(500);

      const encodedData = await multicall.callStatic.aggregate(tmpCalls, {
        blockTag: maxBlock,
      });

      encodedData.returnData.forEach((returnData) => {
        const decoded = rlBtrfly.interface.decodeFunctionResult(
          'lockedBalances',
          returnData
        );

        let newLockedBalance: BigNumber = BigNumber.from(0);
        decoded[3].forEach((lock: any) => {
          const [amount, unlockTime] = lock;

          // Include new locks (both fresh ones and relocks)
          if (unlockTime === deadline + 604800 + 16 * 604800) {
            newLockedBalance = newLockedBalance.add(amount);
          }
        });

        userInfoList[lockers[idx]] =
          userInfoList[lockers[idx]].add(newLockedBalance);

        cachedSnapshot[lockers[idx]] = userInfoList[lockers[idx]].toString();
        totalBalance = totalBalance.add(userInfoList[lockers[idx]]);

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
  // await Promise.each(txHashes, async (txHash) => {
  //   const tx = await provider.getTransaction(txHash);
  //   const events = await tx.wait();
  //   // console.log('Val', tx, events);

  //   // Loop through all logs and parse all Transfer events
  //   events.logs.forEach((log) => {
  //     const token = log.address.toLowerCase();
  //     const hash = log.topics[0];
  //     console.log('Topics', log.topics);
  //     if (hash === erc20TransferHash) {
  //       const params = new ethers.utils.Interface(erc20Abi).parseLog(log);
  //       const [from, to, amount] = params.args;
  //       console.log('Token Transfer', token, from, to, amount);

  //       if (
  //         (token === wethAddress || token === btrflyV2Address) &&
  //         to.toLowerCase() === rewardDistributorAddress.toLowerCase()
  //       ) {
  //         if (token in tokenBalances) {
  //           tokenBalances[token] = tokenBalances[token].add(amount);
  //         } else {
  //           tokenBalances[token] = amount;
  //         }
  //       }
  //     }
  //   });
  // });

  // Hardcode amounts for faster distribution
  tokenBalances[wethAddress] = BigNumber.from(2920).mul(
    BigNumber.from(`${1e16}`)
  );
  tokenBalances[btrflyV2Address] = BigNumber.from(1860).mul(
    BigNumber.from(`${1e18}`)
  );

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
      const eligibleBalance = userInfoList[account];
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

    const tokenSymbol = tokenSymbols[token.toLowerCase()] || 'eth';

    const fileName = `${currentDistDir}/${token}.json`;
    const fileAlias = `${latestDistDir}/${tokenSymbol}.json`;

    await fsMkdirAsync(currentDistDir, { recursive: true });
    await fsMkdirAsync(latestDistDir, { recursive: true });

    await fsWriteFileAsync(fileName, JSON.stringify(cachedDistribution));
    await fsWriteFileAsync(fileAlias, JSON.stringify(cachedDistribution));

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
  const metadata = Object.keys(claimMetadata);
  const tmpMetadata: any = [];
  await Promise.each(metadata, async (account, idx) => {
    tmpMetadata.push(account);

    if ((idx > 0 && idx % 100 === 0) || idx === metadata.length - 1) {
      await Promise.map(tmpMetadata, async (acc: any) => {
        await setTmpUserRewards(acc, claimMetadata[acc]);
      });

      await Promise.delay(1200);

      tmpMetadata.length = 0;
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
