import { createClient, RedisClientType } from '@redis/client';

const {
  REDIS_HOST,
  REDIS_PWD,
  REDIS_PORT,
  REDIS_HOST_DEV,
  REDIS_PWD_DEV,
  REDIS_PORT_DEV,
  NODE_ENV,
} = process.env;

const IS_DEVELOPMENT = NODE_ENV !== 'production';

const host = IS_DEVELOPMENT ? REDIS_HOST_DEV : REDIS_HOST;
const port = IS_DEVELOPMENT ? REDIS_PORT_DEV : REDIS_PORT;
const pwd = IS_DEVELOPMENT ? REDIS_PWD_DEV : REDIS_PWD;

let _client: RedisClientType;

export const redisClient = async (): Promise<RedisClientType> => {
  if (!_client) {
    _client = createClient({
      url: `redis://:${pwd}@${host}:${port}`,
      socket: {
        tls: true,
      },
    });

    _client.on('error', (err) => console.error('Redis Client Error', err));
    await _client.connect();
  }

  return _client;
};

export const setUserRewards = async (
  account: string,
  payload: unknown
): Promise<void> => {
  try {
    const client = await redisClient();
    await client.hSet('rewards', account, JSON.stringify(payload));
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const setTmpUserRewards = async (
  account: string,
  payload: unknown
): Promise<void> => {
  try {
    const client = await redisClient();
    await client.hSet('rewards-tmp', account, JSON.stringify(payload));
  } catch (error) {
    console.log(error);
    throw error;
  }
};
