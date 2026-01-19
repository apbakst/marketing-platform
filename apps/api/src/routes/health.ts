import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@marketing-platform/database';
import { redis } from '../lib/redis.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  fastify.get('/health/ready', async (request, reply) => {
    const checks: Record<string, { status: string; error?: string }> = {};

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok' };
    } catch (error) {
      checks.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Check Redis
    try {
      await redis.ping();
      checks.redis = { status: 'ok' };
    } catch (error) {
      checks.redis = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    const allHealthy = Object.values(checks).every((c) => c.status === 'ok');

    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
};
