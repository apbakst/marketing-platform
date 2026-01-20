import { Redis } from 'ioredis';
import { config } from './config.js';

export const connection = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
}) as any; // Type assertion needed due to ioredis version mismatch with BullMQ

connection.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

connection.on('connect', () => {
  console.log('Connected to Redis');
});

export async function closeConnection(): Promise<void> {
  await connection.quit();
}
