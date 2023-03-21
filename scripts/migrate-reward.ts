import Promise from 'bluebird';
import { setUserRewards, redisClient } from './helpers/redis';

async function main() {
  // Migrate user rewards
  const client = await redisClient();
  const accounts = await client.hKeys('rewards-tmp');

  console.log('Migrating', accounts.length);

  const tmpAccounts: any = [];
  await Promise.each(accounts, async (account, idx) => {
    tmpAccounts.push(account);

    if ((idx > 0 && idx % 100 === 0) || idx === accounts.length - 1) {
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
