import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { z } from 'zod';
import { prisma } from '@marketing-platform/database';
import { generateId, sanitizeEmail, normalizeProperties, CACHE_KEYS, CACHE_TTL } from '@marketing-platform/shared';

const config = {
  port: parseInt(process.env.TRACKING_PORT || '3002', 10),
  host: process.env.HOST || '0.0.0.0',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['*'],
};

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

await fastify.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
});

// Schema definitions
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
  traits: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
  }).passthrough().optional(),
});

// Auth middleware
async function authenticate(request: any, reply: any) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({ error: 'Missing authorization header' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return reply.status(401).send({ error: 'Invalid authorization format' });
  }

  const keyHash = createHash('sha256').update(token).digest('hex');
  const cacheKey = CACHE_KEYS.API_KEY(keyHash);

  let apiKey = await redis.get(cacheKey);
  if (apiKey) {
    request.auth = JSON.parse(apiKey);
    return;
  }

  const dbKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, organizationId: true, type: true, expiresAt: true },
  });

  if (!dbKey) {
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  if (dbKey.expiresAt && dbKey.expiresAt < new Date()) {
    return reply.status(401).send({ error: 'API key expired' });
  }

  await redis.setex(cacheKey, CACHE_TTL.API_KEY, JSON.stringify(dbKey));
  request.auth = dbKey;
}

// Helper: resolve profile ID
async function resolveProfileId(
  organizationId: string,
  input: { profileId?: string; email?: string; externalId?: string }
): Promise<string | null> {
  if (input.profileId) {
    return input.profileId;
  }

  if (input.email) {
    const email = sanitizeEmail(input.email);
    const cacheKey = CACHE_KEYS.PROFILE_BY_EMAIL(organizationId, email);
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached).id;
    }

    let profile = await prisma.profile.findUnique({
      where: { organizationId_email: { organizationId, email } },
    });

    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          id: generateId('prof'),
          organizationId,
          email,
        },
      });
    }

    await redis.setex(cacheKey, CACHE_TTL.PROFILE, JSON.stringify(profile));
    return profile.id;
  }

  if (input.externalId) {
    let profile = await prisma.profile.findUnique({
      where: { organizationId_externalId: { organizationId, externalId: input.externalId } },
    });

    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          id: generateId('prof'),
          organizationId,
          externalId: input.externalId,
        },
      });
    }

    return profile.id;
  }

  return null;
}

// Health check
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Track single event
fastify.post('/track', {
  preHandler: authenticate,
  handler: async (request: any, reply) => {
    const body = trackEventSchema.parse(request.body);
    const { organizationId } = request.auth;

    if (!body.profileId && !body.email && !body.externalId) {
      return reply.status(400).send({ error: 'profileId, email, or externalId required' });
    }

    const profileId = await resolveProfileId(organizationId, body);
    if (!profileId) {
      return reply.status(400).send({ error: 'Could not resolve profile' });
    }

    const event = await prisma.event.create({
      data: {
        id: generateId('evt'),
        organizationId,
        profileId,
        name: body.name,
        properties: body.properties ? normalizeProperties(body.properties) : {},
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        source: 'tracking_api',
      },
    });

    return reply.status(201).send({ success: true, eventId: event.id });
  },
});

// Batch track events
fastify.post('/track/batch', {
  preHandler: authenticate,
  handler: async (request: any, reply) => {
    const body = batchTrackSchema.parse(request.body);
    const { organizationId } = request.auth;

    const results = { processed: 0, errors: [] as { index: number; error: string }[] };

    // Process in parallel batches
    const batchSize = 50;
    for (let i = 0; i < body.events.length; i += batchSize) {
      const batch = body.events.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (event, idx) => {
          try {
            const profileId = await resolveProfileId(organizationId, event);
            if (!profileId) {
              results.errors.push({ index: i + idx, error: 'Could not resolve profile' });
              return;
            }

            await prisma.event.create({
              data: {
                id: generateId('evt'),
                organizationId,
                profileId,
                name: event.name,
                properties: event.properties ? normalizeProperties(event.properties) : {},
                timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
                source: 'tracking_api',
              },
            });
            results.processed++;
          } catch (err) {
            results.errors.push({ index: i + idx, error: (err as Error).message });
          }
        })
      );
    }

    return reply.send({ success: results.errors.length === 0, ...results });
  },
});

// Identify profile
fastify.post('/identify', {
  preHandler: authenticate,
  handler: async (request: any, reply) => {
    const body = identifySchema.parse(request.body);
    const { organizationId } = request.auth;

    if (!body.profileId && !body.email && !body.externalId) {
      return reply.status(400).send({ error: 'profileId, email, or externalId required' });
    }

    const email = body.email ? sanitizeEmail(body.email) : undefined;
    let profile = null;
    let created = false;

    if (body.profileId) {
      profile = await prisma.profile.findUnique({
        where: { id: body.profileId, organizationId },
      });
    } else if (email) {
      profile = await prisma.profile.findUnique({
        where: { organizationId_email: { organizationId, email } },
      });
    } else if (body.externalId) {
      profile = await prisma.profile.findUnique({
        where: { organizationId_externalId: { organizationId, externalId: body.externalId } },
      });
    }

    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          id: generateId('prof'),
          organizationId,
          email,
          externalId: body.externalId,
          firstName: body.traits?.firstName,
          lastName: body.traits?.lastName,
          phone: body.traits?.phone,
          properties: body.properties ? normalizeProperties(body.properties) : {},
        },
      });
      created = true;
    } else {
      profile = await prisma.profile.update({
        where: { id: profile.id },
        data: {
          ...(email && { email }),
          ...(body.externalId && { externalId: body.externalId }),
          ...(body.traits?.firstName && { firstName: body.traits.firstName }),
          ...(body.traits?.lastName && { lastName: body.traits.lastName }),
          ...(body.traits?.phone && { phone: body.traits.phone }),
          ...(body.properties && {
            properties: {
              ...(profile.properties as object),
              ...normalizeProperties(body.properties),
            },
          }),
        },
      });
    }

    // Clear cache
    if (profile.email) {
      await redis.del(CACHE_KEYS.PROFILE_BY_EMAIL(organizationId, profile.email));
    }

    return reply.send({ success: true, profileId: profile.id, created });
  },
});

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    await fastify.close();
    await redis.quit();
    process.exit(0);
  });
}

// Start server
try {
  await fastify.listen({ port: config.port, host: config.host });
  console.log(`Tracking API listening on http://${config.host}:${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
