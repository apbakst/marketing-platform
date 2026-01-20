import { Worker } from 'bullmq';
import { config } from './lib/config.js';
import { closeConnection } from './lib/redis.js';
import { closeQueues } from './lib/queues.js';
import { createEmailSendWorker } from './workers/email-send.worker.js';
import { createSegmentCalculateWorker } from './workers/segment-calculate.worker.js';
import {
  startCampaignScheduler,
  closeCampaignScheduler,
} from './workers/campaign-scheduler.worker.js';
import { createFlowTriggerWorker } from './workers/flow-trigger.worker.js';
import {
  createFlowExecutorWorker,
  startFlowExecutor,
  stopFlowExecutor,
} from './workers/flow-executor.worker.js';
import {
  createSendTimeOptimizationWorker,
  scheduleDailyRecalculation,
} from './workers/send-time-optimization.worker.js';
import { createSmsSendWorker } from './workers/sms-send.worker.js';

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

  // Start the campaign scheduler (polls for scheduled campaigns)
  startCampaignScheduler();

  workers.push(createFlowTriggerWorker());
  console.log('Flow trigger worker started');

  workers.push(createFlowExecutorWorker());
  console.log('Flow executor worker started');

  // Start the flow executor polling (checks for due enrollments)
  startFlowExecutor();

  workers.push(createSendTimeOptimizationWorker());
  console.log('Send time optimization worker started');

  workers.push(createSmsSendWorker());
  console.log('SMS send worker started');

  // Schedule daily recalculation of send times
  await scheduleDailyRecalculation();

  console.log('All workers started successfully');
}

async function shutdown(): Promise<void> {
  console.log('Shutting down workers...');

  // Close campaign scheduler
  await closeCampaignScheduler();
  console.log('Campaign scheduler closed');

  // Close flow executor
  await stopFlowExecutor();
  console.log('Flow executor closed');

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
