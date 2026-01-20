import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sendTimeOptimizationService } from '../services/send-time-optimization.service.js';
import { requireSecretKey } from '../middleware/auth.js';

export const sendTimeRoutes: FastifyPluginAsync = async (fastify) => {
  // Get optimal send time for a profile
  fastify.get<{ Params: { profileId: string } }>('/profiles/:profileId', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const sendTime = await sendTimeOptimizationService.getOptimalSendTime(
        request.params.profileId
      );

      if (!sendTime) {
        return reply.send({
          sendTime: null,
          message: 'Not enough engagement data to determine optimal send time',
        });
      }

      return reply.send({
        sendTime: {
          optimalHour: sendTime.optimalHour,
          optimalDayOfWeek: sendTime.optimalDayOfWeek,
          confidence: sendTime.confidence,
          lastCalculated: sendTime.lastCalculated,
        },
      });
    },
  });

  // Get optimal send times for multiple profiles
  fastify.post('/profiles/batch', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const schema = z.object({
        profileIds: z.array(z.string()).min(1).max(100),
      });

      const { profileIds } = schema.parse(request.body);

      const sendTimes = await sendTimeOptimizationService.getOptimalSendTimesBatch(profileIds);

      const result: Record<string, {
        optimalHour: number;
        optimalDayOfWeek: number | null;
        confidence: number;
      }> = {};

      for (const [profileId, data] of sendTimes) {
        result[profileId] = {
          optimalHour: data.optimalHour,
          optimalDayOfWeek: data.optimalDayOfWeek,
          confidence: data.confidence,
        };
      }

      return reply.send({ sendTimes: result });
    },
  });

  // Get organization-wide optimal send time
  fastify.get('/organization', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const { hour, confidence } = await sendTimeOptimizationService.getOrganizationOptimalSendTime(
        request.auth.organizationId
      );

      return reply.send({
        optimalHour: hour,
        confidence,
      });
    },
  });

  // Manually recalculate send time for a profile
  fastify.post<{ Params: { profileId: string } }>('/profiles/:profileId/calculate', {
    preHandler: requireSecretKey,
    handler: async (request, reply) => {
      const sendTime = await sendTimeOptimizationService.calculateOptimalSendTime(
        request.params.profileId
      );

      if (!sendTime) {
        return reply.send({
          sendTime: null,
          message: 'Not enough engagement data to determine optimal send time',
        });
      }

      return reply.send({
        sendTime: {
          optimalHour: sendTime.optimalHour,
          optimalDayOfWeek: sendTime.optimalDayOfWeek,
          confidence: sendTime.confidence,
          lastCalculated: sendTime.lastCalculated,
        },
      });
    },
  });
};
