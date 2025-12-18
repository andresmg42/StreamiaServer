import Redis from 'ioredis';
import { config } from './index';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl);

    redis.on('connect', () => {
      console.log(`[${config.serviceName}] Connected to Redis`);
    });

    redis.on('error', (err) => {
      console.error(`[${config.serviceName}] Redis error:`, err);
    });
  }

  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log(`[${config.serviceName}] Disconnected from Redis`);
  }
}

// Cache helpers
export async function setCache(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const client = getRedisClient();
  const serialized = JSON.stringify(value);

  if (ttlSeconds) {
    await client.setex(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const value = await client.get(key);

  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function deleteCache(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

export async function invalidateCachePattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  const keys = await client.keys(pattern);

  if (keys.length > 0) {
    await client.del(...keys);
  }
}
