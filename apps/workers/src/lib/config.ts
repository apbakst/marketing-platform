import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/marketing_platform',
  },

  email: {
    ses: {
      region: process.env.AWS_SES_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      configurationSet: process.env.AWS_SES_CONFIGURATION_SET,
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
    postmark: {
      serverToken: process.env.POSTMARK_SERVER_TOKEN,
      messageStream: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
    },
    klaviyo: {
      apiKey: process.env.KLAVIYO_API_KEY,
      revision: process.env.KLAVIYO_API_REVISION || '2024-02-15',
      baseUrl: process.env.KLAVIYO_BASE_URL || 'https://a.klaviyo.com',
    },
  },

  workers: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    maxRetries: parseInt(process.env.WORKER_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.WORKER_RETRY_DELAY || '5000', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;

export type Config = typeof config;
