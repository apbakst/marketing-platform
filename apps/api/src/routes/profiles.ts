import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { profileService } from '../services/profile.service.js';
import { requireSecretKey } from '../middleware/auth.js';

const createProfileSchema = z.object({
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

const searchQuerySchema = z.object({
  email: z.string().optional(),
  externalId: z.string().optional(),
  phone: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export const profileRoutes: FastifyPluginAsync = async (fastify) => {
  // Create profile
  fastify.post('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = createProfileSchema.parse(request.body);

      if (!body.email && !body.externalId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Either email or externalId is required',
        });
      }

      const profile = await profileService.create(
        request.auth.organizationId,
        body
      );

      return reply.status(201).send({ profile });
    },
  });

  // List profiles
  fastify.get('/', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const query = searchQuerySchema.parse(request.query);
      const result = await profileService.search(
        request.auth.organizationId,
        query
      );
      return reply.send(result);
    },
  });

  // Get profile by ID
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const profile = await profileService.getById(
        request.auth.organizationId,
        request.params.id
      );

      if (!profile) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Profile not found',
        });
      }

      return reply.send({ profile });
    },
  });

  // Update profile
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const body = updateProfileSchema.parse(request.body);

      try {
        const profile = await profileService.update(
          request.auth.organizationId,
          request.params.id,
          body
        );
        return reply.send({ profile });
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message.includes('Record to update not found')
        ) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Profile not found',
          });
        }
        throw error;
      }
    },
  });

  // Delete profile
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      try {
        await profileService.delete(
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
            message: 'Profile not found',
          });
        }
        throw error;
      }
    },
  });
};
