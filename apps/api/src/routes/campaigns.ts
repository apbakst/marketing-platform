import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { campaignService } from '../services/campaign.service.js';
import { requireSecretKey } from '../middleware/auth.js';

const sendTimeOptimizationSchema = z.object({
  enabled: z.boolean(),
  maxDelayHours: z.number().min(1).max(168).optional(), // Max 7 days
  fallbackHour: z.number().min(0).max(23).optional(), // Fallback if no profile data
}).optional();

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  previewText: z.string().max(500).optional(),
  fromName: z.string().min(1).max(255),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional(),
  templateId: z.string().optional(),
  htmlContent: z.string().optional(),
  textContent: z.string().optional(),
  segmentIds: z.array(z.string()).optional(),
  excludeSegmentIds: z.array(z.string()).optional(),
  type: z.enum(['regular', 'ab_test']).optional(),
  sendTimeOptimization: sendTimeOptimizationSchema,
  abTestConfig: z
    .object({
      variants: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          subject: z.string().optional(),
          previewText: z.string().optional(),
          templateId: z.string().optional(),
          weight: z.number(),
        })
      ),
      testSize: z.number(),
      winnerCriteria: z.enum(['open_rate', 'click_rate', 'conversion_rate']),
      testDuration: z.number(),
    })
    .optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(500).optional(),
  previewText: z.string().max(500).optional(),
  fromName: z.string().min(1).max(255).optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  templateId: z.string().optional(),
  htmlContent: z.string().optional(),
  textContent: z.string().optional(),
  segmentIds: z.array(z.string()).optional(),
  excludeSegmentIds: z.array(z.string()).optional(),
  sendTimeOptimization: sendTimeOptimizationSchema,
  abTestConfig: z
    .object({
      variants: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          subject: z.string().optional(),
          previewText: z.string().optional(),
          templateId: z.string().optional(),
          weight: z.number(),
        })
      ),
      testSize: z.number(),
      winnerCriteria: z.enum(['open_rate', 'click_rate', 'conversion_rate']),
      testDuration: z.number(),
    })
    .optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']).optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

export const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  // Create campaign
  fastify.post('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = createCampaignSchema.parse(request.body);
      const campaign = await campaignService.create(
        request.auth.organizationId,
        body
      );
      return reply.status(201).send({ campaign });
    },
  });

  // List campaigns
  fastify.get('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      const result = await campaignService.list(
        request.auth.organizationId,
        query
      );
      return reply.send(result);
    },
  });

  // Get campaign by ID
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const campaign = await campaignService.getById(
        request.auth.organizationId,
        request.params.id
      );

      if (!campaign) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Campaign not found',
        });
      }

      return reply.send({ campaign });
    },
  });

  // Update campaign
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = updateCampaignSchema.parse(request.body);

      try {
        const campaign = await campaignService.update(
          request.auth.organizationId,
          request.params.id,
          body
        );
        return reply.send({ campaign });
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === 'Campaign not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Campaign not found',
            });
          }
          if (error.message.includes('draft status')) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: error.message,
            });
          }
        }
        throw error;
      }
    },
  });

  // Delete campaign
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      try {
        await campaignService.delete(
          request.auth.organizationId,
          request.params.id
        );
        return reply.status(204).send();
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === 'Campaign not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Campaign not found',
            });
          }
          if (error.message.includes('Cannot delete')) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: error.message,
            });
          }
        }
        throw error;
      }
    },
  });

  // Schedule campaign
  fastify.post<{ Params: { id: string } }>('/:id/schedule', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = scheduleSchema.parse(request.body);

      try {
        const campaign = await campaignService.schedule(
          request.auth.organizationId,
          request.params.id,
          new Date(body.scheduledAt)
        );
        return reply.send({ campaign });
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === 'Campaign not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Campaign not found',
            });
          }
          return reply.status(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }
        throw error;
      }
    },
  });

  // Cancel scheduled campaign
  fastify.post<{ Params: { id: string } }>('/:id/cancel', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      try {
        const campaign = await campaignService.cancel(
          request.auth.organizationId,
          request.params.id
        );
        return reply.send({ campaign });
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === 'Campaign not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Campaign not found',
            });
          }
          return reply.status(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }
        throw error;
      }
    },
  });

  // Send campaign now
  fastify.post<{ Params: { id: string } }>('/:id/send', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      try {
        const campaign = await campaignService.sendNow(
          request.auth.organizationId,
          request.params.id
        );
        return reply.send({ campaign });
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === 'Campaign not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Campaign not found',
            });
          }
          return reply.status(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }
        throw error;
      }
    },
  });

  // Get campaign stats
  fastify.get<{ Params: { id: string } }>('/:id/stats', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      try {
        const stats = await campaignService.getStats(
          request.auth.organizationId,
          request.params.id
        );
        return reply.send({ stats });
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Campaign not found') {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Campaign not found',
          });
        }
        throw error;
      }
    },
  });

  // Get A/B test stats
  fastify.get<{ Params: { id: string } }>('/:id/ab-test/stats', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      try {
        const stats = await campaignService.getABTestStats(
          request.auth.organizationId,
          request.params.id
        );
        return reply.send({ stats });
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === 'Campaign not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Campaign not found',
            });
          }
          if (error.message === 'Campaign is not an A/B test') {
            return reply.status(400).send({
              error: 'Bad Request',
              message: error.message,
            });
          }
        }
        throw error;
      }
    },
  });

  // Select A/B test winner and send to remaining recipients
  fastify.post<{ Params: { id: string } }>('/:id/ab-test/select-winner', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = z.object({
        winnerId: z.string(),
      }).parse(request.body);

      try {
        const campaign = await campaignService.selectABTestWinner(
          request.auth.organizationId,
          request.params.id,
          body.winnerId
        );
        return reply.send({ campaign });
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (error.message === 'Campaign not found') {
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Campaign not found',
            });
          }
          return reply.status(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }
        throw error;
      }
    },
  });
};
