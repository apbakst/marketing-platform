import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@marketing-platform/database';
import { generateId } from '@marketing-platform/shared';

const createSuppressionSchema = z.object({
  email: z.string().email(),
  reason: z.enum(['bounce', 'complaint', 'unsubscribe', 'manual']),
  bounceType: z.enum(['hard', 'soft']).optional(),
});

const bulkSuppressionSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(1000),
  reason: z.enum(['bounce', 'complaint', 'unsubscribe', 'manual']),
});

const listQuerySchema = z.object({
  reason: z.enum(['bounce', 'complaint', 'unsubscribe', 'manual']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export async function suppressionRoutes(fastify: FastifyInstance): Promise<void> {
  // Get organization ID from auth (simplified for MVP)
  const getOrganizationId = (request: any): string => {
    return request.headers['x-organization-id'] as string || 'org_default';
  };

  // List suppressions
  fastify.get('/', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = listQuerySchema.parse(request.query);
      const limit = query.limit || 50;

      const where: any = { organizationId };

      if (query.reason) {
        where.reason = query.reason;
      }

      if (query.search) {
        where.email = { contains: query.search, mode: 'insensitive' };
      }

      const suppressions = await prisma.suppression.findMany({
        where,
        take: limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined;
      if (suppressions.length > limit) {
        const next = suppressions.pop();
        nextCursor = next?.id;
      }

      return { suppressions, nextCursor };
    },
  });

  // Get suppression stats
  fastify.get('/stats', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);

      const [total, byReason] = await Promise.all([
        prisma.suppression.count({ where: { organizationId } }),
        prisma.suppression.groupBy({
          by: ['reason'],
          where: { organizationId },
          _count: true,
        }),
      ]);

      const stats = {
        total,
        byReason: byReason.reduce((acc, item) => {
          acc[item.reason] = item._count;
          return acc;
        }, {} as Record<string, number>),
      };

      return stats;
    },
  });

  // Check if email is suppressed
  fastify.get<{ Params: { email: string } }>('/check/:email', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const { email } = request.params;

      const suppression = await prisma.suppression.findUnique({
        where: {
          organizationId_email: {
            organizationId,
            email: email.toLowerCase(),
          },
        },
      });

      return {
        suppressed: !!suppression,
        suppression,
      };
    },
  });

  // Create suppression
  fastify.post('/', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const body = createSuppressionSchema.parse(request.body);

      const suppression = await prisma.suppression.upsert({
        where: {
          organizationId_email: {
            organizationId,
            email: body.email.toLowerCase(),
          },
        },
        create: {
          id: generateId('sup'),
          organizationId,
          email: body.email.toLowerCase(),
          reason: body.reason,
          bounceType: body.bounceType,
          source: 'manual',
        },
        update: {
          reason: body.reason,
          bounceType: body.bounceType,
        },
      });

      return reply.status(201).send(suppression);
    },
  });

  // Bulk create suppressions
  fastify.post('/bulk', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const body = bulkSuppressionSchema.parse(request.body);

      const results = {
        created: 0,
        updated: 0,
        errors: [] as Array<{ email: string; error: string }>,
      };

      for (const email of body.emails) {
        try {
          const existing = await prisma.suppression.findUnique({
            where: {
              organizationId_email: {
                organizationId,
                email: email.toLowerCase(),
              },
            },
          });

          if (existing) {
            await prisma.suppression.update({
              where: { id: existing.id },
              data: { reason: body.reason },
            });
            results.updated++;
          } else {
            await prisma.suppression.create({
              data: {
                id: generateId('sup'),
                organizationId,
                email: email.toLowerCase(),
                reason: body.reason,
                source: 'manual_bulk',
              },
            });
            results.created++;
          }
        } catch (error) {
          results.errors.push({
            email,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return results;
    },
  });

  // Delete suppression (unsuppress)
  fastify.delete<{ Params: { email: string } }>('/:email', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const { email } = request.params;

      try {
        await prisma.suppression.delete({
          where: {
            organizationId_email: {
              organizationId,
              email: email.toLowerCase(),
            },
          },
        });

        return reply.status(204).send();
      } catch (error) {
        return reply.status(404).send({ error: 'Suppression not found' });
      }
    },
  });

  // Bulk delete suppressions
  fastify.delete('/bulk', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const body = z.object({
        emails: z.array(z.string().email()),
      }).parse(request.body);

      const result = await prisma.suppression.deleteMany({
        where: {
          organizationId,
          email: { in: body.emails.map(e => e.toLowerCase()) },
        },
      });

      return { deleted: result.count };
    },
  });

  // Export suppressions
  fastify.get('/export', {
    handler: async (request, reply) => {
      const organizationId = getOrganizationId(request);
      const query = listQuerySchema.parse(request.query);

      const where: any = { organizationId };

      if (query.reason) {
        where.reason = query.reason;
      }

      const suppressions = await prisma.suppression.findMany({
        where,
        select: {
          email: true,
          reason: true,
          bounceType: true,
          source: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Return as CSV
      const csv = [
        'email,reason,bounce_type,source,created_at',
        ...suppressions.map(s =>
          `${s.email},${s.reason},${s.bounceType || ''},${s.source || ''},${s.createdAt.toISOString()}`
        ),
      ].join('\n');

      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', 'attachment; filename="suppressions.csv"')
        .send(csv);
    },
  });
}
