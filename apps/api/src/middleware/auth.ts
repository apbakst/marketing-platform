import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { prisma } from '@marketing-platform/database';
import { redis } from '../lib/redis.js';
import { CACHE_KEYS, CACHE_TTL } from '@marketing-platform/shared';

export interface AuthContext {
  organizationId: string;
  apiKeyId: string;
  apiKeyType: 'public' | 'secret';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing authorization header',
    });
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid authorization format. Use: Bearer <api_key>',
    });
  }

  const keyHash = createHash('sha256').update(token).digest('hex');
  const cacheKey = CACHE_KEYS.API_KEY(keyHash);

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    const apiKey = JSON.parse(cached);
    request.auth = {
      organizationId: apiKey.organizationId,
      apiKeyId: apiKey.id,
      apiKeyType: apiKey.type,
    };
    return;
  }

  // Look up in database
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      organizationId: true,
      type: true,
      expiresAt: true,
    },
  });

  if (!apiKey) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'API key has expired',
    });
  }

  // Cache the API key
  await redis.setex(cacheKey, CACHE_TTL.API_KEY, JSON.stringify(apiKey));

  // Update last used timestamp (fire and forget)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  request.auth = {
    organizationId: apiKey.organizationId,
    apiKeyId: apiKey.id,
    apiKeyType: apiKey.type as 'public' | 'secret',
  };
}

export async function requireSecretKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authMiddleware(request, reply);

  if (reply.sent) return;

  if (request.auth.apiKeyType !== 'secret') {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'This endpoint requires a secret API key',
    });
  }
}

export async function requirePublicKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authMiddleware(request, reply);
}
