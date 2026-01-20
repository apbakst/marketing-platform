import { prisma, Segment, Profile, Prisma } from '@marketing-platform/database';
import {
  CreateSegmentInput,
  UpdateSegmentInput,
  ConditionGroup,
  SegmentCondition,
  PropertyCondition,
  EventCondition,
  generateId,
  CACHE_KEYS,
  CACHE_TTL,
} from '@marketing-platform/shared';
import { redis } from '../lib/redis.js';

export class SegmentService {
  async create(
    organizationId: string,
    input: CreateSegmentInput
  ): Promise<Segment> {
    const segment = await prisma.segment.create({
      data: {
        id: generateId('seg'),
        organizationId,
        name: input.name,
        description: input.description,
        conditions: input.conditions as unknown as Prisma.InputJsonValue,
      },
    });

    return segment;
  }

  async update(
    organizationId: string,
    segmentId: string,
    input: UpdateSegmentInput
  ): Promise<Segment> {
    const updateData: Prisma.SegmentUpdateInput = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.conditions !== undefined) {
      updateData.conditions = input.conditions as unknown as Prisma.InputJsonValue;
    }
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const segment = await prisma.segment.update({
      where: {
        id: segmentId,
        organizationId,
      },
      data: updateData,
    });

    await redis.del(CACHE_KEYS.SEGMENT(segmentId));
    return segment;
  }

  async getById(
    organizationId: string,
    segmentId: string
  ): Promise<Segment | null> {
    const cacheKey = CACHE_KEYS.SEGMENT(segmentId);
    const cached = await redis.get(cacheKey);

    if (cached) {
      const segment = JSON.parse(cached);
      if (segment.organizationId === organizationId) {
        return segment;
      }
    }

    const segment = await prisma.segment.findUnique({
      where: {
        id: segmentId,
        organizationId,
      },
    });

    if (segment) {
      await redis.setex(cacheKey, CACHE_TTL.SEGMENT, JSON.stringify(segment));
    }

    return segment;
  }

  async list(
    organizationId: string,
    options: {
      isActive?: boolean;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{ segments: Segment[]; nextCursor?: string }> {
    const limit = Math.min(options.limit || 50, 200);

    const segments = await prisma.segment.findMany({
      where: {
        organizationId,
        ...(options.isActive !== undefined && { isActive: options.isActive }),
      },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (segments.length > limit) {
      const next = segments.pop();
      nextCursor = next?.id;
    }

    return { segments, nextCursor };
  }

  async delete(organizationId: string, segmentId: string): Promise<void> {
    await prisma.segment.delete({
      where: {
        id: segmentId,
        organizationId,
      },
    });

    await redis.del(CACHE_KEYS.SEGMENT(segmentId));
    await redis.del(CACHE_KEYS.SEGMENT_MEMBERS(segmentId));
  }

  async estimateSize(
    organizationId: string,
    conditions: ConditionGroup
  ): Promise<number> {
    // For MVP, do a simple count
    // In production, this would use sampling and optimization
    const profiles = await this.evaluateConditions(organizationId, conditions, 10000);
    return profiles.length;
  }

  async getMembers(
    segmentId: string,
    options: {
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{ profiles: Profile[]; nextCursor?: string }> {
    const limit = Math.min(options.limit || 50, 200);

    const memberships = await prisma.segmentMembership.findMany({
      where: {
        segmentId,
        exitedAt: null,
      },
      include: {
        profile: true,
      },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      orderBy: { enteredAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (memberships.length > limit) {
      const next = memberships.pop();
      nextCursor = next?.id;
    }

    return {
      profiles: memberships.map((m) => m.profile),
      nextCursor,
    };
  }

  async evaluateConditions(
    organizationId: string,
    conditions: ConditionGroup,
    limit: number = 10000
  ): Promise<Profile[]> {
    // Build the SQL where clause from conditions
    const whereClause = this.buildWhereClause(conditions);

    // For property conditions, we can do a simple query
    // For event conditions, we need subqueries
    const profiles = await prisma.profile.findMany({
      where: {
        organizationId,
        ...whereClause,
      },
      take: limit,
    });

    return profiles;
  }

  async calculateMembership(segmentId: string): Promise<void> {
    const segment = await prisma.segment.findUnique({
      where: { id: segmentId },
    });

    if (!segment) {
      throw new Error('Segment not found');
    }

    const conditions = segment.conditions as unknown as ConditionGroup;
    const profiles = await this.evaluateConditions(
      segment.organizationId,
      conditions
    );

    // Get current members
    const currentMembers = await prisma.segmentMembership.findMany({
      where: { segmentId, exitedAt: null },
      select: { profileId: true },
    });

    const currentMemberIds = new Set(currentMembers.map((m) => m.profileId));
    const newMemberIds = new Set(profiles.map((p) => p.id));

    // Find profiles that entered the segment
    const entered = profiles.filter((p) => !currentMemberIds.has(p.id));

    // Find profiles that exited the segment
    const exitedIds = Array.from(currentMemberIds).filter(
      (id) => !newMemberIds.has(id)
    );

    // Batch operations
    const now = new Date();

    if (entered.length > 0) {
      await prisma.segmentMembership.createMany({
        data: entered.map((p) => ({
          id: generateId('segm'),
          segmentId,
          profileId: p.id,
          enteredAt: now,
        })),
        skipDuplicates: true,
      });
    }

    if (exitedIds.length > 0) {
      await prisma.segmentMembership.updateMany({
        where: {
          segmentId,
          profileId: { in: exitedIds },
          exitedAt: null,
        },
        data: { exitedAt: now },
      });
    }

    // Update segment member count
    await prisma.segment.update({
      where: { id: segmentId },
      data: {
        memberCount: newMemberIds.size,
        lastCalculatedAt: now,
      },
    });
  }

  private buildWhereClause(conditions: ConditionGroup): Prisma.ProfileWhereInput {
    const clauses: Prisma.ProfileWhereInput[] = [];

    for (const condition of conditions.conditions) {
      if ('operator' in condition && 'conditions' in condition) {
        // Nested condition group
        clauses.push(this.buildWhereClause(condition as ConditionGroup));
      } else {
        // Single condition
        const singleCondition = condition as SegmentCondition;
        if (singleCondition.type === 'property') {
          const propertyClause = this.buildPropertyClause(
            singleCondition as PropertyCondition
          );
          if (propertyClause) {
            clauses.push(propertyClause);
          }
        }
        // Event conditions require more complex handling with subqueries
        // For MVP, we'll handle them in a separate pass
      }
    }

    if (conditions.operator === 'and') {
      return { AND: clauses };
    } else {
      return { OR: clauses };
    }
  }

  private buildPropertyClause(
    condition: PropertyCondition
  ): Prisma.ProfileWhereInput | null {
    const { field, operator, value } = condition;

    // Handle top-level fields
    if (['email', 'firstName', 'lastName', 'phone', 'externalId'].includes(field)) {
      return this.buildFieldClause(field, operator, value);
    }

    // Handle properties.* fields
    if (field.startsWith('properties.')) {
      const propertyPath = field.substring('properties.'.length);
      return this.buildJsonClause(propertyPath, operator, value);
    }

    return null;
  }

  private buildFieldClause(
    field: string,
    operator: string,
    value: unknown
  ): Prisma.ProfileWhereInput {
    switch (operator) {
      case 'equals':
        return { [field]: value };
      case 'not_equals':
        return { [field]: { not: value } };
      case 'contains':
        return { [field]: { contains: value as string, mode: 'insensitive' } };
      case 'not_contains':
        return { NOT: { [field]: { contains: value as string, mode: 'insensitive' } } };
      case 'starts_with':
        return { [field]: { startsWith: value as string, mode: 'insensitive' } };
      case 'ends_with':
        return { [field]: { endsWith: value as string, mode: 'insensitive' } };
      case 'is_set':
        return { [field]: { not: null } };
      case 'is_not_set':
        return { [field]: null };
      default:
        return {};
    }
  }

  private buildJsonClause(
    path: string,
    operator: string,
    value: unknown
  ): Prisma.ProfileWhereInput {
    // Use Prisma's JSON filtering
    const pathParts = path.split('.');
    const jsonValue = value as Prisma.InputJsonValue;

    switch (operator) {
      case 'equals':
        return {
          properties: {
            path: pathParts,
            equals: jsonValue,
          },
        } as Prisma.ProfileWhereInput;
      case 'not_equals':
        return {
          NOT: {
            properties: {
              path: pathParts,
              equals: jsonValue,
            },
          },
        } as Prisma.ProfileWhereInput;
      case 'is_set':
        return {
          NOT: {
            properties: {
              path: pathParts,
              equals: Prisma.DbNull,
            },
          },
        } as Prisma.ProfileWhereInput;
      case 'is_not_set':
        return {
          properties: {
            path: pathParts,
            equals: Prisma.DbNull,
          },
        } as Prisma.ProfileWhereInput;
      default:
        return {};
    }
  }
}

export const segmentService = new SegmentService();
