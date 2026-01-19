import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eventService } from '../services/event.service.js';
import { requirePublicKey } from '../middleware/auth.js';

const trackEventSchema = z.object({
  profileId: z.string().optional(),
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  name: z.string().min(1).max(255),
  properties: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
});

const batchTrackSchema = z.object({
  events: z.array(trackEventSchema).min(1).max(1000),
});

const identifySchema = z.object({
  profileId: z.string().optional(),
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  traits: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export const trackingRoutes: FastifyPluginAsync = async (fastify) => {
  // Track single event
  fastify.post('/track', {
    preHandler: requirePublicKey,
    handler: async (request, reply) => {
      const body = trackEventSchema.parse(request.body);

      if (!body.profileId && !body.email && !body.externalId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'One of profileId, email, or externalId is required',
        });
      }

      try {
        const event = await eventService.track(
          request.auth.organizationId,
          body,
          'api'
        );

        return reply.status(201).send({
          success: true,
          eventId: event.id,
        });
      } catch (error) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error instanceof Error ? error.message : 'Failed to track event',
        });
      }
    },
  });

  // Batch track events
  fastify.post('/track/batch', {
    preHandler: requirePublicKey,
    handler: async (request, reply) => {
      const body = batchTrackSchema.parse(request.body);

      const result = await eventService.trackBatch(
        request.auth.organizationId,
        body.events,
        'api'
      );

      return reply.send({
        success: result.errors.length === 0,
        processed: result.processed,
        errors: result.errors,
      });
    },
  });

  // Identify profile
  fastify.post('/identify', {
    preHandler: requirePublicKey,
    handler: async (request, reply) => {
      const body = identifySchema.parse(request.body);

      if (!body.profileId && !body.email && !body.externalId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'One of profileId, email, or externalId is required',
        });
      }

      try {
        const result = await eventService.identify(
          request.auth.organizationId,
          body
        );

        return reply.send({
          success: true,
          profileId: result.profileId,
          created: result.created,
        });
      } catch (error) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: error instanceof Error ? error.message : 'Failed to identify profile',
        });
      }
    },
  });
};
