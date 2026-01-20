import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { flowService } from '../services/flow.service.js';

const triggerConfigSchema = z.object({
  type: z.enum(['event', 'segment_entry', 'segment_exit', 'date_property', 'manual']),
  eventName: z.string().optional(),
  segmentId: z.string().optional(),
  dateProperty: z.string().optional(),
  dateOffset: z.number().optional(),
  dateOffsetUnit: z.enum(['hours', 'days', 'weeks']).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown(),
  })).optional(),
});

const nodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'trigger', 'delay', 'email', 'condition', 'split',
    'update_profile', 'add_tag', 'remove_tag', 'webhook', 'exit'
  ]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
});

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
});

const createFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.string(),
  triggerConfig: triggerConfigSchema,
  triggerSegmentId: z.string().optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  settings: z.record(z.unknown()).optional(),
});

const updateFlowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  triggerType: z.string().optional(),
  triggerConfig: triggerConfigSchema.optional(),
  triggerSegmentId: z.string().nullable().optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  settings: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export async function flowRoutes(fastify: FastifyInstance): Promise<void> {
  const getOrganizationId = (request: any): string => {
    return request.headers['x-organization-id'] as string || 'org_default';
  };

  // List flows
  fastify.get('/', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = listQuerySchema.parse(request.query);

      return flowService.list(organizationId, query);
    },
  });

  // Get flow by ID
  fastify.get<{ Params: { id: string } }>('/:id', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const flow = await flowService.getById(organizationId, request.params.id);

      if (!flow) {
        return reply.status(404).send({ error: 'Flow not found' });
      }

      return flow;
    },
  });

  // Create flow
  fastify.post('/', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const body = createFlowSchema.parse(request.body);

      const flow = await flowService.create(organizationId, body);
      return reply.status(201).send(flow);
    },
  });

  // Update flow
  fastify.patch<{ Params: { id: string } }>('/:id', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const body = updateFlowSchema.parse(request.body);

      try {
        const flow = await flowService.update(
          organizationId,
          request.params.id,
          {
            ...body,
            triggerSegmentId: body.triggerSegmentId === null ? undefined : body.triggerSegmentId,
          }
        );
        return flow;
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  // Delete flow
  fastify.delete<{ Params: { id: string } }>('/:id', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);

      try {
        await flowService.delete(organizationId, request.params.id);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return reply.status(404).send({ error: error.message });
          }
          if (error.message.includes('active')) {
            return reply.status(400).send({ error: error.message });
          }
        }
        throw error;
      }
    },
  });

  // Activate flow
  fastify.post<{ Params: { id: string } }>('/:id/activate', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);

      try {
        const flow = await flowService.activate(organizationId, request.params.id);
        return flow;
      } catch (error) {
        if (error instanceof Error) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  // Pause flow
  fastify.post<{ Params: { id: string } }>('/:id/pause', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);

      try {
        const flow = await flowService.pause(organizationId, request.params.id);
        return flow;
      } catch (error) {
        if (error instanceof Error) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  // Get flow stats
  fastify.get<{ Params: { id: string } }>('/:id/stats', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);

      try {
        const stats = await flowService.getStats(organizationId, request.params.id);
        return stats;
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  // Get flow enrollments
  fastify.get<{ Params: { id: string } }>('/:id/enrollments', {
    handler: async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      return flowService.getEnrollments(request.params.id, query);
    },
  });

  // Manually enroll a profile
  fastify.post<{ Params: { id: string } }>('/:id/enroll', {
    handler: async (request, reply) => {
      const body = z.object({
        profileId: z.string(),
        metadata: z.record(z.unknown()).optional(),
      }).parse(request.body);

      try {
        const enrollment = await flowService.enrollProfile(
          request.params.id,
          body.profileId,
          body.metadata
        );
        return reply.status(201).send(enrollment);
      } catch (error) {
        if (error instanceof Error) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
    },
  });

  // Exit an enrollment
  fastify.post<{ Params: { id: string; enrollmentId: string } }>(
    '/:id/enrollments/:enrollmentId/exit',
    {
      handler: async (request, reply) => {
        const body = z.object({
          reason: z.string().optional(),
        }).parse(request.body);

        try {
          const enrollment = await flowService.exitEnrollment(
            request.params.enrollmentId,
            body.reason || 'manual_exit'
          );
          return enrollment;
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            return reply.status(404).send({ error: error.message });
          }
          throw error;
        }
      },
    }
  );
}
