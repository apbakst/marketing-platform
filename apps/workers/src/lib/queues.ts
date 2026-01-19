import { Queue } from 'bullmq';
import { connection } from './redis.js';
import { QUEUE_NAMES } from '@marketing-platform/shared';

// Email sending queue
export const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 60 * 60, // 24 hours
    },
    removeOnFail: {
      count: 5000,
      age: 7 * 24 * 60 * 60, // 7 days
    },
  },
});

// Batch email queue
export const emailBatchQueue = new Queue(QUEUE_NAMES.EMAIL_BATCH, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 60 * 60,
    },
    removeOnFail: {
      count: 500,
      age: 7 * 24 * 60 * 60,
    },
  },
});

// Segment calculation queue
export const segmentCalculateQueue = new Queue(QUEUE_NAMES.SEGMENT_CALCULATE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 30000,
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 60 * 60,
    },
    removeOnFail: {
      count: 100,
      age: 24 * 60 * 60,
    },
  },
});

// Flow enrollment queue
export const flowEnrollmentQueue = new Queue(QUEUE_NAMES.FLOW_ENROLLMENT, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 60 * 60,
    },
    removeOnFail: {
      count: 1000,
      age: 7 * 24 * 60 * 60,
    },
  },
});

// Flow execution queue
export const flowExecuteQueue = new Queue(QUEUE_NAMES.FLOW_EXECUTE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 60 * 60,
    },
    removeOnFail: {
      count: 1000,
      age: 7 * 24 * 60 * 60,
    },
  },
});

// Webhook queue
export const webhookQueue = new Queue(QUEUE_NAMES.WEBHOOK, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: {
      count: 500,
      age: 24 * 60 * 60,
    },
    removeOnFail: {
      count: 500,
      age: 7 * 24 * 60 * 60,
    },
  },
});

export const queues = [
  emailSendQueue,
  emailBatchQueue,
  segmentCalculateQueue,
  flowEnrollmentQueue,
  flowExecuteQueue,
  webhookQueue,
];

export async function closeQueues(): Promise<void> {
  await Promise.all(queues.map((q) => q.close()));
}
