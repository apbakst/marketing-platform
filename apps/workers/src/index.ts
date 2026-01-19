import { Worker } from 'bullmq';
import { config } from './lib/config.js';
import { closeConnection } from './lib/redis.js';
import { closeQueues } from './lib/queues.js';
import { createEmailSendWorker } from './workers/email-send.worker.js';
import { createSegmentCalculateWorker } from './workers/segment-calculate.worker.js';

const workers: Worker[] = [];

async function main(): Promise<void> {
  console.log('Starting workers...');
  console.log(`Environment: ${config.env}`);
  console.log(`Concurrency: ${config.workers.concurrency}`);

  // Create workers
  workers.push(createEmailSendWorker());
  console.log('Email send worker started');

  workers.push(createSegmentCalculateWorker());
  console.log('Segment calculate worker started');

  console.log('All workers started successfully');
}

async function shutdown(): Promise<void> {
  console.log('Shutting down workers...');

  // Close all workers
  await Promise.all(workers.map((w) => w.close()));
  console.log('Workers closed');

  // Close queues
  await closeQueues();
  console.log('Queues closed');

  // Close Redis connection
  await closeConnection();
  console.log('Redis connection closed');

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start workers
main().catch((error) => {
  console.error('Failed to start workers:', error);
  process.exit(1);
});
