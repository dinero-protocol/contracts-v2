import Promise from 'bluebird';
import { ethers } from 'hardhat';
import { RewardDistributor } from '../typechain';
import { setUserRewards, redisClient } from './helpers/redis';

const rewardDistributorAddress = '0xd7807E5752B368A6a64b76828Aaff0750522a76E';
const previousBlock = 17176760;

async function main() {
  // Get metadata events
  const rewardDistributor = (await ethers.getContractAt(
    'RewardDistributor',
    rewardDistributorAddress
  )) as RewardDistributor;

  const metadataEvents = await rewardDistributor.queryFilter(
    rewardDistributor.filters.RewardMetadataUpdated(),
    previousBlock,
    'latest'
  );

  console.log(metadataEvents.length);
  if (!metadataEvents.length) return;

  // Migrate user rewards
  const client = await redisClient();
  const accounts = await client.hKeys('rewards-tmp');

  console.log('Migrating', accounts.length);
  if (accounts.length !== 5301) return;

  const tmpAccounts: any = [];
  await Promise.each(accounts, async (account, idx) => {
    tmpAccounts.push(account);

    if ((idx > 0 && idx % 100 === 0) || idx === accounts.length - 1) {
      console.log('Migrating up to index', idx);
      await Promise.map(tmpAccounts, async (account: any) => {
        const payload: any = await client.hGet('rewards-tmp', account);
        await setUserRewards(account, JSON.parse(payload));
        await client.hDel('rewards-tmp', account);
      });

      await Promise.delay(1500);

      tmpAccounts.length = 0;
    }
  });

  console.log('Done');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

