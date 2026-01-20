import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimiterService } from '../services/rate-limiter.service.js';

export async function rateLimitRoutes(fastify: FastifyInstance): Promise<void> {
  // Get current rate limit status
  fastify.get(
    '/status',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Get rate limit status',
        description: 'Get current rate limit status for the authenticated organization',
        tags: ['Rate Limiting'],
        response: {
          200: {
            type: 'object',
            properties: {
              api: {
                type: 'object',
                properties: {
                  limit: { type: 'number' },
                  remaining: { type: 'number' },
                  resetAt: { type: 'string' },
                },
              },
              tracking: {
                type: 'object',
                properties: {
                  limit: { type: 'number' },
                  remaining: { type: 'number' },
                  resetAt: { type: 'string' },
                },
              },
              email: {
                type: 'object',
                properties: {
                  hourlyRemaining: { type: 'number' },
                  dailyRemaining: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;

      const [apiStatus, trackingStatus, emailStatus] = await Promise.all([
        rateLimiterService.getStatus(organizationId, 'api'),
        rateLimiterService.getStatus(organizationId, 'tracking'),
        rateLimiterService.checkEmailSendLimit(organizationId, 0),
      ]);

      return reply.send({
        api: {
          limit: apiStatus.limit,
          remaining: apiStatus.remaining,
          resetAt: new Date(apiStatus.resetAt).toISOString(),
        },
        tracking: {
          limit: trackingStatus.limit,
          remaining: trackingStatus.remaining,
          resetAt: new Date(trackingStatus.resetAt).toISOString(),
        },
        email: {
          hourlyRemaining: emailStatus.hourlyRemaining,
          dailyRemaining: emailStatus.dailyRemaining,
        },
      });
    }
  );

  // Get organization limits configuration
  fastify.get(
    '/limits',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Get rate limit configuration',
        description: 'Get rate limit configuration for the organization',
        tags: ['Rate Limiting'],
        response: {
          200: {
            type: 'object',
            properties: {
              apiRequests: { type: 'number' },
              trackingRequests: { type: 'number' },
              emailsPerHour: { type: 'number' },
              emailsPerDay: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const limits = await rateLimiterService.getOrganizationLimits(organizationId);
      return reply.send(limits);
    }
  );

  // Update organization limits (admin only)
  fastify.put(
    '/limits',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Update rate limit configuration',
        description: 'Update rate limit configuration for the organization (admin only)',
        tags: ['Rate Limiting'],
        body: {
          type: 'object',
          properties: {
            apiRequests: { type: 'number', minimum: 100, maximum: 100000 },
            trackingRequests: { type: 'number', minimum: 1000, maximum: 1000000 },
            emailsPerHour: { type: 'number', minimum: 100, maximum: 1000000 },
            emailsPerDay: { type: 'number', minimum: 1000, maximum: 10000000 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              limits: {
                type: 'object',
                properties: {
                  apiRequests: { type: 'number' },
                  trackingRequests: { type: 'number' },
                  emailsPerHour: { type: 'number' },
                  emailsPerDay: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const body = request.body as {
        apiRequests?: number;
        trackingRequests?: number;
        emailsPerHour?: number;
        emailsPerDay?: number;
      };

      await rateLimiterService.setOrganizationLimits(organizationId, {
        apiRequests: body.apiRequests,
        trackingRequests: body.trackingRequests,
        emailsPerHour: body.emailsPerHour,
        emailsPerDay: body.emailsPerDay,
      });

      const limits = await rateLimiterService.getOrganizationLimits(organizationId);
      return reply.send({ success: true, limits });
    }
  );

  // Reset rate limit (admin only, for testing)
  fastify.post(
    '/reset',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Reset rate limits',
        description: 'Reset rate limits for testing purposes (admin only)',
        tags: ['Rate Limiting'],
        body: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['api', 'tracking', 'all'] },
          },
          required: ['type'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const body = request.body as { type: 'api' | 'tracking' | 'all' };

      if (body.type === 'all') {
        await Promise.all([
          rateLimiterService.reset(organizationId, 'api'),
          rateLimiterService.reset(organizationId, 'tracking'),
        ]);
      } else {
        await rateLimiterService.reset(organizationId, body.type);
      }

      return reply.send({
        success: true,
        message: `Rate limits reset for type: ${body.type}`,
      });
    }
  );
}
