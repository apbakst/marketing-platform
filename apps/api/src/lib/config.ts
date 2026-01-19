import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/marketing_platform',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;

export type Config = typeof config;
