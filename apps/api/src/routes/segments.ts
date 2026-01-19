import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { segmentService } from '../services/segment.service.js';
import { requireSecretKey } from '../middleware/auth.js';

const conditionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('property'),
      field: z.string(),
      operator: z.string(),
      value: z.unknown().optional(),
    }),
    z.object({
      type: z.literal('event'),
      eventName: z.string(),
      operator: z.enum(['has_done', 'has_not_done', 'done_count']),
      count: z.number().optional(),
      countOperator: z.enum(['equals', 'greater_than', 'less_than']).optional(),
      timeframe: z
        .object({
          unit: z.enum(['hours', 'days', 'weeks', 'months']),
          value: z.number(),
        })
        .optional(),
    }),
    z.object({
      operator: z.enum(['and', 'or']),
      conditions: z.array(conditionSchema),
    }),
  ])
);

const conditionGroupSchema = z.object({
  operator: z.enum(['and', 'or']),
  conditions: z.array(conditionSchema),
});

const createSegmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  conditions: conditionGroupSchema,
});

const updateSegmentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  conditions: conditionGroupSchema.optional(),
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  limit: z.coerce.number().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export const segmentRoutes: FastifyPluginAsync = async (fastify) => {
  // Create segment
  fastify.post('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = createSegmentSchema.parse(request.body);
      const segment = await segmentService.create(
        request.auth.organizationId,
        body as any
      );
      return reply.status(201).send({ segment });
    },
  });

  // List segments
  fastify.get('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      const result = await segmentService.list(
        request.auth.organizationId,
        query
      );
      return reply.send(result);
    },
  });

  // Get segment by ID
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const segment = await segmentService.getById(
        request.auth.organizationId,
        request.params.id
      );

      if (!segment) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Segment not found',
        });
      }

      return reply.send({ segment });
    },
  });

  // Update segment
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = updateSegmentSchema.parse(request.body);

      try {
        const segment = await segmentService.update(
          request.auth.organizationId,
          request.params.id,
          body as any
        );
        return reply.send({ segment });
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message.includes('Record to update not found')
        ) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Segment not found',
          });
        }
        throw error;
      }
    },
  });

  // Delete segment
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      try {
        await segmentService.delete(
          request.auth.organizationId,
          request.params.id
        );
        return reply.status(204).send();
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message.includes('Record to delete does not exist')
        ) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Segment not found',
          });
        }
        throw error;
      }
    },
  });

  // Get segment members
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; cursor?: string } }>(
    '/:id/members',
    {
      preHandler: requireSecretKey,
      handler: async (request, reply) => {
        const segment = await segmentService.getById(
          request.auth.organizationId,
          request.params.id
        );

        if (!segment) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Segment not found',
          });
        }

        const result = await segmentService.getMembers(request.params.id, {
          limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
          cursor: request.query.cursor,
        });

        return reply.send(result);
      },
    }
  );

  // Estimate segment size
  fastify.post('/estimate', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = z.object({ conditions: conditionGroupSchema }).parse(request.body);
      const count = await segmentService.estimateSize(
        request.auth.organizationId,
        body.conditions as any
      );
      return reply.send({ estimatedCount: count });
    },
  });

  // Recalculate segment membership
  fastify.post<{ Params: { id: string } }>('/:id/recalculate', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const segment = await segmentService.getById(
        request.auth.organizationId,
        request.params.id
      );

      if (!segment) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Segment not found',
        });
      }

      await segmentService.calculateMembership(request.params.id);

      const updated = await segmentService.getById(
        request.auth.organizationId,
        request.params.id
      );

      return reply.send({ segment: updated });
    },
  });
};
