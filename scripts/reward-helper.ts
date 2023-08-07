export const epochDuration = 1209600;

const getBlockTimestamp = async (provider: any, block: number | string) => {
  const { timestamp } = await provider.getBlock(block);

  return timestamp;
};

const findBlock = async (provider: any, timestamp: number) => {
  let startBlock = 15317426;
  let endBlock = await provider.getBlockNumber();
  let ret = 0;

  while (startBlock < endBlock) {
    const mid = Math.floor((startBlock + endBlock) / 2);
    // eslint-disable-next-line no-await-in-loop
    const time = await getBlockTimestamp(provider, mid);
    // console.log(mid, time);

    if (time > timestamp) {
      endBlock = mid - 1;
    } else if (time < timestamp) {
      startBlock = mid + 1;
    } else {
      ret = mid;
      break;
    }
  }

  if (!ret) {
    ret = startBlock;
  }

  console.log(
    startBlock,
    endBlock,
    ret,
    await getBlockTimestamp(provider, ret)
  );

  return ret;
};

const firstCurDeadline = 1660176000; // cur
const firstMinDeadline = 1659571200; // min
const firstMaxDeadline = 1660780800; // max

// WARNING: Take care if epoch >= 9 (unlock active)
// where we should take into account relock (at most 1 week after the snapshot, called grace period)
// in which the relock amount should be the smaller amount
// between locked amount during that grace period and the unlocked amount on the snapshot week

export type DeadlineMetadata = {
  curBlock: number;
  minBlock: number;
  maxBlock: number;
  prevBlock: number;
  curDeadline: number;
};

export const getCurrentEpoch = async (provider: any): Promise<number> => {
  const currentTimestamp = await getBlockTimestamp(provider, 'latest');

  return Math.floor((currentTimestamp - firstCurDeadline) / epochDuration) + 1;
};

export const getDeadlineMetadata = async (
  provider: any,
  epoch: number
): Promise<DeadlineMetadata> => {
  const curDeadline = firstCurDeadline + (epoch - 1) * epochDuration;
  let curBlock = await findBlock(provider, curDeadline);
  let time = await getBlockTimestamp(provider, curBlock);
  if (time < curDeadline) {
    curBlock += 1;
  }
  console.log('Cur epoch at block #', curBlock, 'and timestamp =', curDeadline);

  const minDeadline = firstMinDeadline + (epoch - 1) * epochDuration;
  let minBlock = await findBlock(provider, minDeadline);
  time = await getBlockTimestamp(provider, minBlock);
  if (time < minDeadline) {
    minBlock += 1;
  }
  console.log('Min epoch at block #', minBlock, 'and timestamp =', minDeadline);

  const maxDeadline = firstMaxDeadline + (epoch - 1) * epochDuration;
  let maxBlock = await findBlock(provider, maxDeadline);
  time = await getBlockTimestamp(provider, maxBlock);
  if (time < maxDeadline) {
    maxBlock += 1;
  }
  console.log('Max epoch at block #', maxBlock, 'and timestamp =', maxDeadline);

  const prevDeadline = firstCurDeadline + (epoch - 2) * epochDuration;
  let prevBlock = await findBlock(provider, prevDeadline);
  time = await getBlockTimestamp(provider, prevBlock);
  if (time >= prevDeadline) {
    prevBlock -= 1;
  }
  console.log(
    'Prev epoch at block #',
    prevBlock,
    'and timestamp =',
    prevDeadline
  );

  console.log(`// Updated for epoch #${epoch}`);
  console.log(
    `// [cur: ${curBlock}] [min: ${minBlock}] [max: ${maxBlock}] [prev: ${prevBlock}] [deadline: ${curDeadline}]`
  );

  return {
    curBlock,
    minBlock,
    maxBlock,
    prevBlock,
    curDeadline,
  };
};
