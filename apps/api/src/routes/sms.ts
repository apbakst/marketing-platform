import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authMiddleware, requireSecretKey } from '../middleware/auth.js';
import { smsService } from '../services/sms.service.js';

const SendSmsSchema = z.object({
  profileId: z.string().optional(),
  phone: z.string().optional(),
  externalId: z.string().optional(),
  message: z.string().min(1).max(1600),
  mediaUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const SetConsentSchema = z.object({
  profileId: z.string(),
  phone: z.string(),
  consent: z.boolean(),
  source: z.string().optional(),
});

export async function smsRoutes(fastify: FastifyInstance): Promise<void> {
  // Send SMS
  fastify.post(
    '/send',
    {
      preHandler: [requireSecretKey],
      schema: {
        summary: 'Send an SMS message',
        description: 'Send an SMS to a profile. Requires SMS consent.',
        tags: ['SMS'],
        body: {
          type: 'object',
          properties: {
            profileId: { type: 'string' },
            phone: { type: 'string' },
            externalId: { type: 'string' },
            message: { type: 'string', minLength: 1, maxLength: 1600 },
            mediaUrl: { type: 'string', format: 'uri' },
            scheduledAt: { type: 'string', format: 'date-time' },
          },
          required: ['message'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              toNumber: { type: 'string' },
              body: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const input = SendSmsSchema.parse(request.body);

      const smsSend = await smsService.send(organizationId, input);

      return reply.send({
        id: smsSend.id,
        status: smsSend.status,
        toNumber: smsSend.toNumber,
        body: smsSend.body,
        createdAt: smsSend.createdAt.toISOString(),
      });
    }
  );

  // Get SMS by ID
  fastify.get(
    '/:id',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Get SMS by ID',
        description: 'Get details of an SMS send',
        tags: ['SMS'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const params = request.params as { id: string };

      const smsSend = await smsService.getById(organizationId, params.id);

      if (!smsSend) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'SMS send not found',
        });
      }

      return reply.send(smsSend);
    }
  );

  // Get SMS sends for a profile
  fastify.get(
    '/profile/:profileId',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Get SMS sends for profile',
        description: 'Get all SMS sends for a specific profile',
        tags: ['SMS'],
        params: {
          type: 'object',
          properties: {
            profileId: { type: 'string' },
          },
          required: ['profileId'],
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 200 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const params = request.params as { profileId: string };
      const query = request.query as { limit?: number; cursor?: string };

      const result = await smsService.getByProfile(organizationId, params.profileId, {
        limit: query.limit,
        cursor: query.cursor,
      });

      return reply.send(result);
    }
  );

  // Get SMS statistics
  fastify.get(
    '/stats',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Get SMS statistics',
        description: 'Get SMS sending statistics for the organization',
        tags: ['SMS'],
        querystring: {
          type: 'object',
          properties: {
            after: { type: 'string', format: 'date-time' },
            before: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              sent: { type: 'number' },
              delivered: { type: 'number' },
              failed: { type: 'number' },
              pending: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const query = request.query as { after?: string; before?: string };

      const stats = await smsService.getStats(organizationId, {
        after: query.after ? new Date(query.after) : undefined,
        before: query.before ? new Date(query.before) : undefined,
      });

      return reply.send(stats);
    }
  );

  // Get SMS consent
  fastify.get(
    '/consent/:phone',
    {
      preHandler: [authMiddleware],
      schema: {
        summary: 'Get SMS consent status',
        description: 'Check SMS consent status for a phone number',
        tags: ['SMS'],
        params: {
          type: 'object',
          properties: {
            phone: { type: 'string' },
          },
          required: ['phone'],
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const params = request.params as { phone: string };

      const consent = await smsService.getConsent(organizationId, params.phone);

      if (!consent) {
        return reply.send({
          phone: params.phone,
          consentGiven: false,
          hasRecord: false,
        });
      }

      return reply.send({
        phone: consent.phone,
        consentGiven: consent.consentGiven,
        consentSource: consent.consentSource,
        consentedAt: consent.consentedAt?.toISOString(),
        optedOutAt: consent.optedOutAt?.toISOString(),
        hasRecord: true,
      });
    }
  );

  // Set SMS consent
  fastify.post(
    '/consent',
    {
      preHandler: [requireSecretKey],
      schema: {
        summary: 'Set SMS consent',
        description: 'Set SMS consent for a profile',
        tags: ['SMS'],
        body: {
          type: 'object',
          properties: {
            profileId: { type: 'string' },
            phone: { type: 'string' },
            consent: { type: 'boolean' },
            source: { type: 'string' },
          },
          required: ['profileId', 'phone', 'consent'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              phone: { type: 'string' },
              consentGiven: { type: 'boolean' },
              consentSource: { type: 'string' },
              consentedAt: { type: 'string' },
              optedOutAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organizationId = (request as any).auth.organizationId;
      const input = SetConsentSchema.parse(request.body);

      const consent = await smsService.setConsent(
        organizationId,
        input.profileId,
        input.phone,
        input.consent,
        input.source || 'api'
      );

      return reply.send({
        phone: consent.phone,
        consentGiven: consent.consentGiven,
        consentSource: consent.consentSource,
        consentedAt: consent.consentedAt?.toISOString(),
        optedOutAt: consent.optedOutAt?.toISOString(),
      });
    }
  );

  // Opt out a phone number
  fastify.post(
    '/consent/opt-out',
    {
      preHandler: [requireSecretKey],
      schema: {
        summary: 'Opt out phone number',
        description: 'Mark a phone number as opted out of SMS',
        tags: ['SMS'],
        body: {
          type: 'object',
          properties: {
            phone: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['phone'],
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
      const body = request.body as { phone: string; source?: string };

      await smsService.handleOptOut(organizationId, body.phone, body.source || 'api');

      return reply.send({
        success: true,
        message: `Phone number ${body.phone} has been opted out`,
      });
    }
  );
}
