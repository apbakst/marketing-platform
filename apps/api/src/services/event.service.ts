import { prisma, Event } from '@marketing-platform/database';
import {
  TrackEventInput,
  IdentifyInput,
  generateId,
  normalizeProperties,
  sanitizeEmail,
} from '@marketing-platform/shared';
import { profileService } from './profile.service.js';

export class EventService {
  async track(
    organizationId: string,
    input: TrackEventInput,
    source: string = 'api'
  ): Promise<Event> {
    // Resolve profile
    const profileId = await this.resolveProfileId(organizationId, input);

    if (!profileId) {
      throw new Error(
        'Could not resolve profile. Provide profileId, email, or externalId.'
      );
    }

    const timestamp = input.timestamp
      ? new Date(input.timestamp)
      : new Date();

    const properties = input.properties
      ? normalizeProperties(input.properties)
      : {};

    const event = await prisma.event.create({
      data: {
        id: generateId('evt'),
        organizationId,
        profileId,
        name: input.name,
        properties,
        timestamp,
        source,
      },
    });

    return event;
  }

  async trackBatch(
    organizationId: string,
    events: TrackEventInput[],
    source: string = 'api'
  ): Promise<{ processed: number; errors: Array<{ index: number; error: string }> }> {
    const results = {
      processed: 0,
      errors: [] as Array<{ index: number; error: string }>,
    };

    // Process events in parallel with concurrency limit
    const batchSize = 50;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const promises = batch.map(async (event, batchIndex) => {
        const index = i + batchIndex;
        try {
          await this.track(organizationId, event, source);
          results.processed++;
        } catch (error) {
          results.errors.push({
            index,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });
      await Promise.all(promises);
    }

    return results;
  }

  async identify(
    organizationId: string,
    input: IdentifyInput
  ): Promise<{ profileId: string; created: boolean }> {
    const { profile, created } = await profileService.findOrCreate(
      organizationId,
      {
        email: input.email,
        externalId: input.externalId,
        firstName: input.traits?.firstName as string | undefined,
        lastName: input.traits?.lastName as string | undefined,
        phone: input.traits?.phone as string | undefined,
        properties: input.properties,
      }
    );

    return { profileId: profile.id, created };
  }

  async getByProfile(
    organizationId: string,
    profileId: string,
    options: {
      name?: string;
      limit?: number;
      before?: Date;
      after?: Date;
    } = {}
  ): Promise<Event[]> {
    const limit = Math.min(options.limit || 50, 200);

    return prisma.event.findMany({
      where: {
        organizationId,
        profileId,
        ...(options.name && { name: options.name }),
        ...(options.before && { timestamp: { lt: options.before } }),
        ...(options.after && { timestamp: { gt: options.after } }),
      },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  async countByName(
    organizationId: string,
    name: string,
    options: {
      profileId?: string;
      after?: Date;
      before?: Date;
    } = {}
  ): Promise<number> {
    return prisma.event.count({
      where: {
        organizationId,
        name,
        ...(options.profileId && { profileId: options.profileId }),
        ...(options.after && { timestamp: { gte: options.after } }),
        ...(options.before && { timestamp: { lte: options.before } }),
      },
    });
  }

  private async resolveProfileId(
    organizationId: string,
    input: TrackEventInput
  ): Promise<string | null> {
    // Direct profile ID provided
    if (input.profileId) {
      const profile = await profileService.getById(
        organizationId,
        input.profileId
      );
      return profile?.id || null;
    }

    // Look up by email
    if (input.email) {
      const email = sanitizeEmail(input.email);
      const profile = await profileService.getByEmail(organizationId, email);

      if (profile) {
        return profile.id;
      }

      // Auto-create profile
      const { profile: newProfile } = await profileService.findOrCreate(
        organizationId,
        { email }
      );
      return newProfile.id;
    }

    // Look up by external ID
    if (input.externalId) {
      const profile = await profileService.getByExternalId(
        organizationId,
        input.externalId
      );

      if (profile) {
        return profile.id;
      }

      // Auto-create profile
      const { profile: newProfile } = await profileService.findOrCreate(
        organizationId,
        { externalId: input.externalId }
      );
      return newProfile.id;
    }

    return null;
  }
}

export const eventService = new EventService();
