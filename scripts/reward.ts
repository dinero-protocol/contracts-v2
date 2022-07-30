import Promise from 'bluebird';
import checksum from 'checksum';
import { ethers } from 'hardhat';
import fs from 'fs';
import { BalanceTree } from '../lib/merkle';
import { ERC20, Multicall, Multicall__factory, RLBTRFLY } from '../typechain';
import { parseLog } from '../test/helpers';
import { BigNumber, utils } from 'ethers';
import { multisigAddress } from './constants';

const fsMkdirAsync = <(path: fs.PathLike, options: any) => void>(
  Promise.promisify(fs.mkdir)
);
const fsWriteFileAsync = <(path: fs.PathLike, data: any) => void>(
  Promise.promisify(fs.writeFile)
);

const checksumAsync = <(file: string, options: any) => void>(
  Promise.promisify(checksum.file)
);

// TODO: Should replace with mainnet values on production
const provider = new ethers.providers.StaticJsonRpcProvider(
  'https://eth-goerli.g.alchemy.com/v2/maPcegLiAfXMtMm6OcjbnfLFNG9afF2E'
);
const rlBtrflyAddress = '0xb4ce286398c3eebde71c63a6a925d7823821c1ee';
const multicallAddress = '0x77dca2c955b15e9de4dbbcf1246b4b85b651e50e';
const minBlock = 7311342; // Block for the actual snapshot
const maxBlock = 7311742; // Block for the relock threshold snapshot
const deadline = 1659117600; // Epoch timestamp for the actual snapshot

// Used for storing cached distribution data
const dataDir = `data`;
const currentDir = `${dataDir}/${deadline}`;

// List of tx hashes used for sending in rewards for the current snapshot
const txHashes = [
  '0x0e0869435d525f5f4218a2954e0fc33d9dbdd4677c16c029909b709411b67981',
  '0x8dea0e0bc7fd79668b034251d79d1b3703692a08869cb2c42ba8d57b4e36aaf5',
];
// Transfer event hash used to filter out all ERC20 Transfer events
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

  // Need this to parse the event logs properly
  const erc20 = (await ethers.getContractAt(
    '@rari-capital/solmate/src/tokens/ERC20.sol:ERC20',
    '0x5829435707acedb5260aa0a4f619c377bd577f8c' // Can be any valid ERC20 token address
  )) as ERC20;

  // Get unique list of lockers from the very beginning
  const lockedEvents = await rlBtrfly.queryFilter(rlBtrfly.filters.Locked());
  const tmpLockers: Set<string> = new Set<string>();
  lockedEvents.map(({ args }) => tmpLockers.add(args[0].toLowerCase()));
  const lockers = Array.from(tmpLockers);

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
  const lockedBalanceEncodedData = await multicall.callStatic.aggregate(
    lockedBalanceCalls,
    { blockTag: minBlock }
  );
  const userInfoList: UserInfoList = {};
  lockedBalanceEncodedData.returnData.forEach((returnData, idx) => {
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
  });

  // Fetch locks data at the snapshot block to check relocks later
  const lockEncodedData = await multicall.callStatic.aggregate(lockCalls, {
    blockTag: minBlock,
  });
  lockEncodedData.returnData.forEach((returnData, idx) => {
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
  });

  // Fetch latest balance to be used for tracking potential relocks
  const balanceEncodedData = await multicall.callStatic.aggregate(
    balanceCalls,
    { blockTag: maxBlock }
  );
  balanceEncodedData.returnData.forEach((returnData, idx) => {
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
  });

  // console.log(userInfoList['0x28e984b8ca48508f37f3d1fd466b7cce2da6befc']);
  console.log(totalBalance);

  const tokenBalances: TokenBalance = {};

  // Fetch all tx details and parse all token transfer data
  await Promise.each(txHashes, async (txHash) => {
    console.log(txHash);
    const tx = await provider.getTransaction(txHash);
    const events = await tx.wait();
    // console.log(tx);
    console.log('Eth Transfer', tx.value);

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
        const params = parseLog(erc20, log);
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

  console.log(tokenBalances);

  // Populate the distribution data based on users' balance ratios
  const distribution: RewardDistribution = {};
  Object.keys(tokenBalances).forEach((token) => {
    console.log(token, tokenBalances[token]);

    if (!(token in distribution)) {
      distribution[token] = [];
    }

    Object.keys(userInfoList).forEach((account) => {
      const { eligibleBalance } = userInfoList[account];
      const amount = eligibleBalance
        .mul(tokenBalances[token])
        .div(totalBalance);

      distribution[token].push({
        account,
        amount,
      });
    });
  });

  console.log(distribution);

  // Generate merkle roots+proofs for all tokens and cache distribution data
  const distributorCallParams: any = [];
  const claimMetadata: any = {};
  await Promise.each(Object.keys(distribution), async (token) => {
    const hashedDistributions = new BalanceTree(distribution[token]);
    const merkleRoot = hashedDistributions.getHexRoot();
    console.log('Distribution:', token, merkleRoot);

    const cachedDistribution: { account: string; amount: string }[] = [];
    distribution[token].forEach(({ account, amount }) => {
      cachedDistribution.push({
        account,
        amount: amount.toString(),
      });

      const proof = hashedDistributions.getProof(account, amount);

      const data = {
        amount,
        token,
        proof,
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

    const checksumHash: any = await checksumAsync(fileName, {
      algorithm: 'MD5',
    });

    const callParams = {
      token,
      merkleRoot,
      proof: utils.keccak256(utils.toUtf8Bytes(checksumHash)),
    };

    distributorCallParams.push(callParams);
  });

  // Transform the calldata for multisig calls
  const transformedCallParams: any = [];
  distributorCallParams.forEach((row: any) => {
    const { token, merkleRoot, proof } = row;

    transformedCallParams.push([token, merkleRoot, proof]);
  });
  console.log(transformedCallParams);

  console.log(claimMetadata);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
