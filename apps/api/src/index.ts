import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './lib/config.js';
import { redis, closeRedis } from './lib/redis.js';
import { healthRoutes } from './routes/health.js';
import { profileRoutes } from './routes/profiles.js';
import { trackingRoutes } from './routes/tracking.js';
import { segmentRoutes } from './routes/segments.js';
import { campaignRoutes } from './routes/campaigns.js';
import { templateRoutes } from './routes/templates.js';
import { trackingEventsRoutes } from './routes/tracking-events.js';
import { webhookRoutes } from './routes/webhooks.js';
import { suppressionRoutes } from './routes/suppressions.js';
import { analyticsRoutes } from './routes/analytics.js';
import { flowRoutes } from './routes/flows.js';
import { sendTimeRoutes } from './routes/send-time.js';
import { rateLimitRoutes } from './routes/rate-limit.js';
import { organizationRateLimitHook } from './middleware/rate-limit.js';
import { smsRoutes } from './routes/sms.js';
import { smsWebhookRoutes } from './routes/sms-webhooks.js';

const fastify = Fastify({
  logger: {
    level: config.logging.level,
    transport:
      config.env === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

// Register plugins
await fastify.register(cors, {
  origin: config.cors.origin,
  credentials: true,
});

await fastify.register(helmet, {
  contentSecurityPolicy: false,
});

await fastify.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
  redis,
});

await fastify.register(sensible);

// Add organization-based rate limiting hook for API routes
// This runs after auth middleware populates request.auth
fastify.addHook('preHandler', organizationRateLimitHook);

await fastify.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Marketing Platform API',
      description: 'API for the marketing automation platform',
      version: '0.1.0',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  // Zod validation errors
  if (error.name === 'ZodError') {
    const zodError = error as unknown as { issues: unknown[] };
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: zodError.issues,
    });
  }

  // Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    if (prismaError.code === 'P2002') {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'A record with this value already exists',
      });
    }
    if (prismaError.code === 'P2025') {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Record not found',
      });
    }
  }

  // Log unexpected errors
  fastify.log.error(error);

  // Don't expose internal errors in production
  if (config.env === 'production') {
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }

  return reply.status(500).send({
    error: 'Internal Server Error',
    message: error.message,
    stack: error.stack,
  });
});

// Register routes
await fastify.register(healthRoutes);
await fastify.register(trackingEventsRoutes); // No prefix - uses /t/o, /t/c, /unsubscribe
await fastify.register(trackingRoutes, { prefix: '/api/v1' });
await fastify.register(profileRoutes, { prefix: '/api/v1/profiles' });
await fastify.register(segmentRoutes, { prefix: '/api/v1/segments' });
await fastify.register(campaignRoutes, { prefix: '/api/v1/campaigns' });
await fastify.register(templateRoutes, { prefix: '/api/v1/templates' });
await fastify.register(webhookRoutes); // No prefix - uses /webhooks/*
await fastify.register(suppressionRoutes, { prefix: '/api/v1/suppressions' });
await fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
await fastify.register(flowRoutes, { prefix: '/api/v1/flows' });
await fastify.register(sendTimeRoutes, { prefix: '/api/v1/send-time' });
await fastify.register(rateLimitRoutes, { prefix: '/api/v1/rate-limit' });
await fastify.register(smsRoutes, { prefix: '/api/v1/sms' });
await fastify.register(smsWebhookRoutes); // No prefix - uses /webhooks/*

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

for (const signal of signals) {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    await closeRedis();
    process.exit(0);
  });
}

// Start server
try {
  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(`Server listening on http://${config.host}:${config.port}`);
  fastify.log.info(`API docs available at http://${config.host}:${config.port}/docs`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
