import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { rateLimiterService } from '../services/rate-limiter.service.js';

interface RateLimitOptions {
  type?: 'api' | 'tracking';
}

/**
 * Rate limiting hook for organization-based API rate limiting
 */
export async function organizationRateLimitHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip if no auth context (public endpoints)
  if (!(request as any).auth?.organizationId) {
    return;
  }

  const organizationId = (request as any).auth.organizationId;
  const isTracking = request.url.includes('/track') || request.url.includes('/identify');
  const type = isTracking ? 'tracking' : 'api';

  const result = await rateLimiterService.checkLimit(organizationId, type);

  // Add rate limit headers
  const headers = rateLimiterService.getHeaders(result);
  for (const [key, value] of Object.entries(headers)) {
    reply.header(key, value);
  }

  if (!result.allowed) {
    reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please retry after the reset time.',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
    });
  }
}

/**
 * Check email send rate limit before sending
 */
export async function checkEmailRateLimit(
  organizationId: string,
  count: number = 1
): Promise<{ allowed: boolean; message?: string }> {
  const result = await rateLimiterService.checkEmailSendLimit(organizationId, count);

  if (!result.allowed) {
    const message = result.hourlyRemaining === 0
      ? 'Hourly email sending limit exceeded'
      : 'Daily email sending limit exceeded';
    return { allowed: false, message };
  }

  return { allowed: true };
}

/**
 * Check provider rate limit before sending through a specific provider
 */
export async function checkProviderRateLimit(
  providerId: string,
  providerType: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const result = await rateLimiterService.checkProviderLimit(providerId, providerType);

  if (!result.allowed) {
    return {
      allowed: false,
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
    };
  }

  return { allowed: true };
}

/**
 * Fastify plugin for enhanced rate limiting
 */
async function rateLimitPluginHandler(
  fastify: FastifyInstance,
  options: RateLimitOptions
): Promise<void> {
  // Add rate limit hook to all routes
  fastify.addHook('preHandler', organizationRateLimitHook);

  // Decorate fastify with rate limiter utilities
  fastify.decorate('checkEmailRateLimit', checkEmailRateLimit);
  fastify.decorate('checkProviderRateLimit', checkProviderRateLimit);
}

export const rateLimitPlugin = fp(rateLimitPluginHandler, {
  name: 'enhanced-rate-limit',
  fastify: '4.x',
});

/**
 * Rate limit info route
 */
export async function rateLimitInfoRoute(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const organizationId = (request as any).auth?.organizationId;

  if (!organizationId) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Organization ID required',
    });
    return;
  }

  const [apiStatus, trackingStatus, emailStatus] = await Promise.all([
    rateLimiterService.getStatus(organizationId, 'api'),
    rateLimiterService.getStatus(organizationId, 'tracking'),
    rateLimiterService.checkEmailSendLimit(organizationId, 0),
  ]);

  reply.send({
    api: {
      limit: apiStatus.limit,
      remaining: apiStatus.remaining,
      resetAt: new Date(apiStatus.resetAt).toISOString(),
    },
    tracking: {
      limit: trackingStatus.limit,
      remaining: trackingStatus.remaining,
      resetAt: new Date(trackingStatus.resetAt).toISOString(),
    },
    email: {
      hourlyRemaining: emailStatus.hourlyRemaining,
      dailyRemaining: emailStatus.dailyRemaining,
    },
  });
}
