import { redis } from '../lib/redis.js';
import { CACHE_KEYS } from '@marketing-platform/shared';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

interface EmailRateLimit {
  hourlyLimit: number;
  dailyLimit: number;
}

export class RateLimiterService {
  /**
   * Default rate limits
   */
  private defaultLimits: Record<string, RateLimitConfig> = {
    api: { maxRequests: 1000, windowMs: 60000 }, // 1000 req/min
    tracking: { maxRequests: 10000, windowMs: 60000 }, // 10000 req/min for tracking
    email_send: { maxRequests: 100, windowMs: 1000 }, // 100 emails/sec
    segment_calculate: { maxRequests: 10, windowMs: 60000 }, // 10 segments/min
    flow_trigger: { maxRequests: 100, windowMs: 1000 }, // 100 triggers/sec
  };

  /**
   * Check and consume a rate limit
   */
  async checkLimit(
    key: string,
    type: string = 'api',
    customLimit?: RateLimitConfig
  ): Promise<RateLimitResult> {
    const config = customLimit || this.defaultLimits[type] || this.defaultLimits.api;
    const fullKey = CACHE_KEYS.RATE_LIMIT(`${type}:${key}`);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Use Redis sorted set for sliding window rate limiting
    const multi = redis.multi();

    // Remove old entries outside the window
    multi.zremrangebyscore(fullKey, 0, windowStart);

    // Count current entries in window
    multi.zcard(fullKey);

    // Add new entry if we'll allow it
    multi.zadd(fullKey, now, `${now}:${Math.random()}`);

    // Set expiry on the key
    multi.pexpire(fullKey, config.windowMs);

    const results = await multi.exec();

    // zcard result is the count before adding new entry
    const currentCount = (results?.[1]?.[1] as number) || 0;
    const allowed = currentCount < config.maxRequests;

    if (!allowed) {
      // Remove the entry we just added since we're not allowing this request
      await redis.zremrangebyscore(fullKey, now, now);
    }

    // Get the oldest entry timestamp for reset time
    const oldest = await redis.zrange(fullKey, 0, 0, 'WITHSCORES');
    const resetAt = oldest.length >= 2
      ? parseInt(oldest[1]) + config.windowMs
      : now + config.windowMs;

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - currentCount - (allowed ? 1 : 0)),
      resetAt,
      limit: config.maxRequests,
    };
  }

  /**
   * Check rate limit without consuming
   */
  async getStatus(key: string, type: string = 'api'): Promise<RateLimitResult> {
    const config = this.defaultLimits[type] || this.defaultLimits.api;
    const fullKey = CACHE_KEYS.RATE_LIMIT(`${type}:${key}`);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove old entries
    await redis.zremrangebyscore(fullKey, 0, windowStart);

    // Count current entries
    const currentCount = await redis.zcard(fullKey);

    return {
      allowed: currentCount < config.maxRequests,
      remaining: Math.max(0, config.maxRequests - currentCount),
      resetAt: now + config.windowMs,
      limit: config.maxRequests,
    };
  }

  /**
   * Check organization-specific API rate limit
   */
  async checkOrganizationLimit(
    organizationId: string,
    type: string = 'api'
  ): Promise<RateLimitResult> {
    // TODO: Load organization-specific limits from settings
    return this.checkLimit(organizationId, type);
  }

  /**
   * Check email sending rate limit for an organization
   */
  async checkEmailSendLimit(
    organizationId: string,
    count: number = 1
  ): Promise<{ allowed: boolean; hourlyRemaining: number; dailyRemaining: number }> {
    const hourlyKey = `email_hourly:${organizationId}`;
    const dailyKey = `email_daily:${organizationId}`;
    const now = Date.now();

    // Default limits (can be made configurable per organization)
    const limits: EmailRateLimit = {
      hourlyLimit: 10000, // 10k emails/hour
      dailyLimit: 100000, // 100k emails/day
    };

    // Check hourly limit
    const hourlyCount = await redis.get(hourlyKey);
    const currentHourly = parseInt(hourlyCount || '0');

    // Check daily limit
    const dailyCount = await redis.get(dailyKey);
    const currentDaily = parseInt(dailyCount || '0');

    const hourlyAllowed = currentHourly + count <= limits.hourlyLimit;
    const dailyAllowed = currentDaily + count <= limits.dailyLimit;
    const allowed = hourlyAllowed && dailyAllowed;

    if (allowed) {
      // Increment counters
      const hourExpiry = 3600; // 1 hour in seconds
      const dayExpiry = 86400; // 24 hours in seconds

      const multi = redis.multi();
      multi.incrby(hourlyKey, count);
      multi.expire(hourlyKey, hourExpiry);
      multi.incrby(dailyKey, count);
      multi.expire(dailyKey, dayExpiry);
      await multi.exec();
    }

    return {
      allowed,
      hourlyRemaining: Math.max(0, limits.hourlyLimit - currentHourly - (allowed ? count : 0)),
      dailyRemaining: Math.max(0, limits.dailyLimit - currentDaily - (allowed ? count : 0)),
    };
  }

  /**
   * Check provider-specific rate limit
   */
  async checkProviderLimit(
    providerId: string,
    providerType: string
  ): Promise<RateLimitResult> {
    // Provider-specific rate limits
    const providerLimits: Record<string, RateLimitConfig> = {
      ses: { maxRequests: 14, windowMs: 1000 }, // SES: 14/sec default
      sendgrid: { maxRequests: 100, windowMs: 1000 }, // SendGrid: 100/sec
      postmark: { maxRequests: 50, windowMs: 1000 }, // Postmark: 50/sec
    };

    const config = providerLimits[providerType] || { maxRequests: 10, windowMs: 1000 };
    return this.checkLimit(providerId, 'provider', config);
  }

  /**
   * Check tracking API rate limit (higher limits)
   */
  async checkTrackingLimit(organizationId: string): Promise<RateLimitResult> {
    return this.checkLimit(organizationId, 'tracking');
  }

  /**
   * Get rate limit headers for HTTP response
   */
  getHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
    };
  }

  /**
   * Reset a rate limit (for testing or admin purposes)
   */
  async reset(key: string, type: string = 'api'): Promise<void> {
    const fullKey = CACHE_KEYS.RATE_LIMIT(`${type}:${key}`);
    await redis.del(fullKey);
  }

  /**
   * Set custom limits for an organization
   */
  async setOrganizationLimits(
    organizationId: string,
    limits: {
      apiRequests?: number;
      trackingRequests?: number;
      emailsPerHour?: number;
      emailsPerDay?: number;
    }
  ): Promise<void> {
    const key = `org_limits:${organizationId}`;
    await redis.set(key, JSON.stringify(limits));
  }

  /**
   * Get custom limits for an organization
   */
  async getOrganizationLimits(organizationId: string): Promise<{
    apiRequests: number;
    trackingRequests: number;
    emailsPerHour: number;
    emailsPerDay: number;
  }> {
    const key = `org_limits:${organizationId}`;
    const stored = await redis.get(key);

    const defaults = {
      apiRequests: 1000,
      trackingRequests: 10000,
      emailsPerHour: 10000,
      emailsPerDay: 100000,
    };

    if (!stored) {
      return defaults;
    }

    const custom = JSON.parse(stored);
    return {
      ...defaults,
      ...custom,
    };
  }
}

export const rateLimiterService = new RateLimiterService();
