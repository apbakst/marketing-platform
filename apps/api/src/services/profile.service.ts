import { prisma, Profile, Prisma } from '@marketing-platform/database';
import {
  CreateProfileInput,
  UpdateProfileInput,
  ProfileSearchParams,
  generateId,
  sanitizeEmail,
  normalizeProperties,
  CACHE_KEYS,
  CACHE_TTL,
} from '@marketing-platform/shared';
import { redis } from '../lib/redis.js';

export class ProfileService {
  async create(
    organizationId: string,
    input: CreateProfileInput
  ): Promise<Profile> {
    const email = input.email ? sanitizeEmail(input.email) : undefined;
    const properties = input.properties
      ? normalizeProperties(input.properties)
      : {};

    const profile = await prisma.profile.create({
      data: {
        id: generateId('prof'),
        organizationId,
        email,
        externalId: input.externalId,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        properties,
      },
    });

    await this.cacheProfile(profile);
    return profile;
  }

  async update(
    organizationId: string,
    profileId: string,
    input: UpdateProfileInput
  ): Promise<Profile> {
    const email = input.email ? sanitizeEmail(input.email) : undefined;

    const updateData: Prisma.ProfileUpdateInput = {};

    if (email !== undefined) updateData.email = email;
    if (input.externalId !== undefined) updateData.externalId = input.externalId;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.firstName !== undefined) updateData.firstName = input.firstName;
    if (input.lastName !== undefined) updateData.lastName = input.lastName;

    if (input.properties) {
      const existingProfile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: { properties: true },
      });

      updateData.properties = {
        ...(existingProfile?.properties as object || {}),
        ...normalizeProperties(input.properties),
      };
    }

    const profile = await prisma.profile.update({
      where: {
        id: profileId,
        organizationId,
      },
      data: updateData,
    });

    await this.cacheProfile(profile);
    return profile;
  }

  async getById(
    organizationId: string,
    profileId: string
  ): Promise<Profile | null> {
    const cacheKey = CACHE_KEYS.PROFILE(organizationId, profileId);
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const profile = await prisma.profile.findUnique({
      where: {
        id: profileId,
        organizationId,
      },
    });

    if (profile) {
      await this.cacheProfile(profile);
    }

    return profile;
  }

  async getByEmail(
    organizationId: string,
    email: string
  ): Promise<Profile | null> {
    const normalizedEmail = sanitizeEmail(email);
    const cacheKey = CACHE_KEYS.PROFILE_BY_EMAIL(organizationId, normalizedEmail);
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const profile = await prisma.profile.findUnique({
      where: {
        organizationId_email: {
          organizationId,
          email: normalizedEmail,
        },
      },
    });

    if (profile) {
      await this.cacheProfile(profile);
    }

    return profile;
  }

  async getByExternalId(
    organizationId: string,
    externalId: string
  ): Promise<Profile | null> {
    return prisma.profile.findUnique({
      where: {
        organizationId_externalId: {
          organizationId,
          externalId,
        },
      },
    });
  }

  async findOrCreate(
    organizationId: string,
    input: CreateProfileInput
  ): Promise<{ profile: Profile; created: boolean }> {
    let profile: Profile | null = null;

    // Try to find by email first
    if (input.email) {
      profile = await this.getByEmail(organizationId, input.email);
    }

    // Try to find by external ID
    if (!profile && input.externalId) {
      profile = await this.getByExternalId(organizationId, input.externalId);
    }

    if (profile) {
      // Update existing profile with new data
      const updated = await this.update(organizationId, profile.id, {
        ...input,
        properties: input.properties
          ? { ...(profile.properties as object), ...input.properties }
          : undefined,
      });
      return { profile: updated, created: false };
    }

    // Create new profile
    const newProfile = await this.create(organizationId, input);
    return { profile: newProfile, created: true };
  }

  async search(
    organizationId: string,
    params: ProfileSearchParams
  ): Promise<{ profiles: Profile[]; nextCursor?: string }> {
    const limit = Math.min(params.limit || 50, 200);

    const where: Prisma.ProfileWhereInput = {
      organizationId,
    };

    if (params.email) {
      where.email = { contains: params.email, mode: 'insensitive' };
    }

    if (params.externalId) {
      where.externalId = params.externalId;
    }

    if (params.phone) {
      where.phone = { contains: params.phone };
    }

    const profiles = await prisma.profile.findMany({
      where,
      take: limit + 1,
      cursor: params.cursor ? { id: params.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (profiles.length > limit) {
      const next = profiles.pop();
      nextCursor = next?.id;
    }

    return { profiles, nextCursor };
  }

  async delete(organizationId: string, profileId: string): Promise<void> {
    const profile = await prisma.profile.delete({
      where: {
        id: profileId,
        organizationId,
      },
    });

    // Clear cache
    await redis.del(CACHE_KEYS.PROFILE(organizationId, profileId));
    if (profile.email) {
      await redis.del(CACHE_KEYS.PROFILE_BY_EMAIL(organizationId, profile.email));
    }
  }

  async count(organizationId: string): Promise<number> {
    return prisma.profile.count({
      where: { organizationId },
    });
  }

  private async cacheProfile(profile: Profile): Promise<void> {
    const pipeline = redis.pipeline();

    pipeline.setex(
      CACHE_KEYS.PROFILE(profile.organizationId, profile.id),
      CACHE_TTL.PROFILE,
      JSON.stringify(profile)
    );

    if (profile.email) {
      pipeline.setex(
        CACHE_KEYS.PROFILE_BY_EMAIL(profile.organizationId, profile.email),
        CACHE_TTL.PROFILE,
        JSON.stringify(profile)
      );
    }

    await pipeline.exec();
  }
}

export const profileService = new ProfileService();
