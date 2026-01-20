import { prisma } from '@marketing-platform/database';
import { redis } from '../lib/redis.js';
import { CACHE_TTL } from '@marketing-platform/shared';

interface HourlyEngagement {
  hour: number;
  opens: number;
  clicks: number;
  score: number;
}

interface ProfileSendTime {
  profileId: string;
  optimalHour: number;
  optimalDayOfWeek: number | null;
  confidence: number;
  lastCalculated: Date;
}

export class SendTimeOptimizationService {
  /**
   * Calculate the optimal send time for a profile based on their engagement history
   */
  async calculateOptimalSendTime(profileId: string): Promise<ProfileSendTime | null> {
    // Get all email events (opens/clicks) for this profile in the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const events = await prisma.emailEvent.findMany({
      where: {
        profileId,
        type: { in: ['opened', 'clicked'] },
        timestamp: { gte: ninetyDaysAgo },
      },
      select: {
        type: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    if (events.length < 5) {
      // Not enough data to determine optimal time
      return null;
    }

    // Aggregate engagement by hour of day
    const hourlyEngagement: Map<number, HourlyEngagement> = new Map();

    for (let hour = 0; hour < 24; hour++) {
      hourlyEngagement.set(hour, { hour, opens: 0, clicks: 0, score: 0 });
    }

    for (const event of events) {
      const hour = event.timestamp.getHours();
      const hourData = hourlyEngagement.get(hour)!;

      if (event.type === 'opened') {
        hourData.opens += 1;
        hourData.score += 1;
      } else if (event.type === 'clicked') {
        hourData.clicks += 1;
        hourData.score += 3; // Clicks are weighted higher
      }
    }

    // Find the hour with the highest engagement score
    let bestHour = 9; // Default to 9 AM
    let bestScore = 0;
    let totalScore = 0;

    for (const [hour, data] of hourlyEngagement) {
      totalScore += data.score;
      if (data.score > bestScore) {
        bestScore = data.score;
        bestHour = hour;
      }
    }

    // Calculate confidence (0-1) based on how concentrated the engagement is
    const confidence = totalScore > 0 ? Math.min(bestScore / totalScore * 3, 1) : 0;

    // Also check for day-of-week patterns if we have enough data
    let optimalDayOfWeek: number | null = null;
    if (events.length >= 20) {
      const dayEngagement = new Map<number, number>();
      for (let day = 0; day < 7; day++) {
        dayEngagement.set(day, 0);
      }

      for (const event of events) {
        const day = event.timestamp.getDay();
        const score = event.type === 'clicked' ? 3 : 1;
        dayEngagement.set(day, dayEngagement.get(day)! + score);
      }

      let bestDayScore = 0;
      for (const [day, score] of dayEngagement) {
        if (score > bestDayScore) {
          bestDayScore = score;
          optimalDayOfWeek = day;
        }
      }
    }

    const result: ProfileSendTime = {
      profileId,
      optimalHour: bestHour,
      optimalDayOfWeek,
      confidence,
      lastCalculated: new Date(),
    };

    // Store in profile properties
    await this.storeOptimalSendTime(profileId, result);

    return result;
  }

  /**
   * Store optimal send time in profile properties
   */
  private async storeOptimalSendTime(profileId: string, sendTime: ProfileSendTime): Promise<void> {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { properties: true },
    });

    const properties = (profile?.properties as Record<string, unknown>) || {};

    await prisma.profile.update({
      where: { id: profileId },
      data: {
        properties: {
          ...properties,
          _sendTimeOptimization: {
            optimalHour: sendTime.optimalHour,
            optimalDayOfWeek: sendTime.optimalDayOfWeek,
            confidence: sendTime.confidence,
            lastCalculated: sendTime.lastCalculated.toISOString(),
          },
        },
      },
    });

    // Note: Profile cache invalidation would require organizationId
    // The profile cache is short-lived, so skipping invalidation is acceptable
  }

  /**
   * Get optimal send time for a profile from cache or calculate it
   */
  async getOptimalSendTime(profileId: string): Promise<ProfileSendTime | null> {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { properties: true },
    });

    const properties = (profile?.properties as Record<string, unknown>) || {};
    const storedData = properties._sendTimeOptimization as {
      optimalHour: number;
      optimalDayOfWeek: number | null;
      confidence: number;
      lastCalculated: string;
    } | undefined;

    if (storedData) {
      const lastCalculated = new Date(storedData.lastCalculated);
      const daysSinceCalculated = (Date.now() - lastCalculated.getTime()) / (1000 * 60 * 60 * 24);

      // Recalculate if data is older than 7 days
      if (daysSinceCalculated < 7) {
        return {
          profileId,
          optimalHour: storedData.optimalHour,
          optimalDayOfWeek: storedData.optimalDayOfWeek,
          confidence: storedData.confidence,
          lastCalculated,
        };
      }
    }

    // Calculate fresh
    return this.calculateOptimalSendTime(profileId);
  }

  /**
   * Get optimal send times for multiple profiles (batch operation)
   */
  async getOptimalSendTimesBatch(profileIds: string[]): Promise<Map<string, ProfileSendTime>> {
    const results = new Map<string, ProfileSendTime>();

    // Get profiles with their send time data
    const profiles = await prisma.profile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, properties: true },
    });

    const profilesToCalculate: string[] = [];

    for (const profile of profiles) {
      const properties = (profile.properties as Record<string, unknown>) || {};
      const storedData = properties._sendTimeOptimization as {
        optimalHour: number;
        optimalDayOfWeek: number | null;
        confidence: number;
        lastCalculated: string;
      } | undefined;

      if (storedData) {
        const lastCalculated = new Date(storedData.lastCalculated);
        const daysSinceCalculated = (Date.now() - lastCalculated.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceCalculated < 7) {
          results.set(profile.id, {
            profileId: profile.id,
            optimalHour: storedData.optimalHour,
            optimalDayOfWeek: storedData.optimalDayOfWeek,
            confidence: storedData.confidence,
            lastCalculated,
          });
          continue;
        }
      }
      profilesToCalculate.push(profile.id);
    }

    // Calculate for profiles without fresh data
    for (const profileId of profilesToCalculate) {
      const sendTime = await this.calculateOptimalSendTime(profileId);
      if (sendTime) {
        results.set(profileId, sendTime);
      }
    }

    return results;
  }

  /**
   * Get organization-wide optimal send time (fallback when profile data is insufficient)
   */
  async getOrganizationOptimalSendTime(organizationId: string): Promise<{ hour: number; confidence: number }> {
    const cacheKey = `org:${organizationId}:optimal_send_time`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Analyze all email events for the organization in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await prisma.emailEvent.findMany({
      where: {
        emailSend: { organizationId },
        type: { in: ['opened', 'clicked'] },
        timestamp: { gte: thirtyDaysAgo },
      },
      select: {
        type: true,
        timestamp: true,
      },
    });

    if (events.length < 50) {
      // Not enough data, return default
      return { hour: 10, confidence: 0 };
    }

    // Aggregate by hour
    const hourlyScores = new Map<number, number>();
    for (let hour = 0; hour < 24; hour++) {
      hourlyScores.set(hour, 0);
    }

    for (const event of events) {
      const hour = event.timestamp.getHours();
      const score = event.type === 'clicked' ? 3 : 1;
      hourlyScores.set(hour, hourlyScores.get(hour)! + score);
    }

    let bestHour = 10;
    let bestScore = 0;
    let totalScore = 0;

    for (const [hour, score] of hourlyScores) {
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestHour = hour;
      }
    }

    const confidence = totalScore > 0 ? Math.min(bestScore / totalScore * 3, 1) : 0;
    const result = { hour: bestHour, confidence };

    // Cache for 1 day
    await redis.setex(cacheKey, CACHE_TTL.SEGMENT_MEMBERS, JSON.stringify(result));

    return result;
  }

  /**
   * Calculate scheduled send time for a profile based on optimization settings
   */
  calculateScheduledTime(
    baseTime: Date,
    optimalHour: number,
    optimalDayOfWeek: number | null,
    maxDelayHours: number = 24
  ): Date {
    const scheduledTime = new Date(baseTime);
    const currentHour = scheduledTime.getHours();

    // Calculate hours until optimal hour
    let hoursUntilOptimal = optimalHour - currentHour;
    if (hoursUntilOptimal < 0) {
      hoursUntilOptimal += 24;
    }

    // If we need to wait for a specific day
    if (optimalDayOfWeek !== null) {
      const currentDay = scheduledTime.getDay();
      let daysUntilOptimal = optimalDayOfWeek - currentDay;
      if (daysUntilOptimal < 0) {
        daysUntilOptimal += 7;
      }

      // Only wait for day if it's within reasonable bounds (max 3 days)
      if (daysUntilOptimal > 0 && daysUntilOptimal <= 3) {
        scheduledTime.setDate(scheduledTime.getDate() + daysUntilOptimal);
      }
    }

    // Apply hour adjustment if within max delay
    if (hoursUntilOptimal <= maxDelayHours) {
      scheduledTime.setHours(optimalHour, 0, 0, 0);

      // If the time is in the past, move to next day
      if (scheduledTime < baseTime) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }
    }

    return scheduledTime;
  }
}

export const sendTimeOptimizationService = new SendTimeOptimizationService();
