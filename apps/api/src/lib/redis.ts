import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
