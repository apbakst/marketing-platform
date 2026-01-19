import { Worker, Job } from 'bullmq';
import { prisma } from '@marketing-platform/database';
import { QUEUE_NAMES, generateId, ConditionGroup } from '@marketing-platform/shared';
import { connection } from '../lib/redis.js';
import { config } from '../lib/config.js';

export interface SegmentCalculateJobData {
  segmentId: string;
  organizationId: string;
}

async function processSegmentCalculate(
  job: Job<SegmentCalculateJobData>
): Promise<void> {
  const { segmentId, organizationId } = job.data;

  console.log(`Calculating membership for segment ${segmentId}`);

  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
  });

  if (!segment || segment.organizationId !== organizationId) {
    console.error(`Segment ${segmentId} not found`);
    return;
  }

  if (!segment.isActive) {
    console.log(`Segment ${segmentId} is inactive, skipping calculation`);
    return;
  }

  const conditions = segment.conditions as unknown as ConditionGroup;

  // Evaluate conditions and get matching profiles
  const matchingProfiles = await evaluateSegmentConditions(
    organizationId,
    conditions
  );

  const matchingProfileIds = new Set(matchingProfiles.map((p) => p.id));

  // Get current members
  const currentMembers = await prisma.segmentMembership.findMany({
    where: { segmentId, exitedAt: null },
    select: { id: true, profileId: true },
  });

  const currentMemberIds = new Set(currentMembers.map((m) => m.profileId));

  // Calculate entered and exited profiles
  const enteredProfileIds: string[] = [];
  const exitedMembershipIds: string[] = [];

  for (const profileId of matchingProfileIds) {
    if (!currentMemberIds.has(profileId)) {
      enteredProfileIds.push(profileId);
    }
  }

  for (const member of currentMembers) {
    if (!matchingProfileIds.has(member.profileId)) {
      exitedMembershipIds.push(member.id);
    }
  }

  const now = new Date();

  // Batch create new memberships
  if (enteredProfileIds.length > 0) {
    console.log(`Adding ${enteredProfileIds.length} profiles to segment ${segmentId}`);

    await prisma.segmentMembership.createMany({
      data: enteredProfileIds.map((profileId) => ({
        id: generateId('segm'),
        segmentId,
        profileId,
        enteredAt: now,
      })),
      skipDuplicates: true,
    });

    // TODO: Trigger flow enrollments for segment entry
    // await flowEnrollmentQueue.addBulk(
    //   enteredProfileIds.map(profileId => ({
    //     name: 'segment-entry',
    //     data: { segmentId, profileId, type: 'entry' }
    //   }))
    // );
  }

  // Batch update exited memberships
  if (exitedMembershipIds.length > 0) {
    console.log(`Removing ${exitedMembershipIds.length} profiles from segment ${segmentId}`);

    await prisma.segmentMembership.updateMany({
      where: { id: { in: exitedMembershipIds } },
      data: { exitedAt: now },
    });

    // TODO: Trigger flow enrollments for segment exit
  }

  // Update segment stats
  await prisma.segment.update({
    where: { id: segmentId },
    data: {
      memberCount: matchingProfileIds.size,
      lastCalculatedAt: now,
    },
  });

  console.log(
    `Segment ${segmentId} calculation complete: ${matchingProfileIds.size} members, ${enteredProfileIds.length} entered, ${exitedMembershipIds.length} exited`
  );
}

async function evaluateSegmentConditions(
  organizationId: string,
  conditions: ConditionGroup
): Promise<Array<{ id: string }>> {
  // Build Prisma where clause from conditions
  const whereClause = buildWhereClause(conditions);

  const profiles = await prisma.profile.findMany({
    where: {
      organizationId,
      ...whereClause,
    },
    select: { id: true },
    take: 100000, // Limit for safety
  });

  return profiles;
}

function buildWhereClause(conditions: ConditionGroup): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];

  for (const condition of conditions.conditions) {
    if ('operator' in condition && 'conditions' in condition) {
      // Nested group
      clauses.push(buildWhereClause(condition as ConditionGroup));
    } else if ('type' in condition) {
      if (condition.type === 'property') {
        const clause = buildPropertyClause(condition as {
          field: string;
          operator: string;
          value?: unknown;
        });
        if (clause) {
          clauses.push(clause);
        }
      }
      // Event conditions would require subqueries - simplified for MVP
    }
  }

  if (clauses.length === 0) {
    return {};
  }

  if (conditions.operator === 'and') {
    return { AND: clauses };
  } else {
    return { OR: clauses };
  }
}

function buildPropertyClause(condition: {
  field: string;
  operator: string;
  value?: unknown;
}): Record<string, unknown> | null {
  const { field, operator, value } = condition;

  // Handle top-level fields
  const topLevelFields = ['email', 'firstName', 'lastName', 'phone', 'externalId'];
  if (topLevelFields.includes(field)) {
    return buildFieldCondition(field, operator, value);
  }

  // Handle properties.* fields
  if (field.startsWith('properties.')) {
    const path = field.substring('properties.'.length).split('.');
    return buildJsonCondition(path, operator, value);
  }

  return null;
}

function buildFieldCondition(
  field: string,
  operator: string,
  value: unknown
): Record<string, unknown> {
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
    case 'greater_than':
      return { [field]: { gt: value } };
    case 'less_than':
      return { [field]: { lt: value } };
    case 'greater_than_or_equals':
      return { [field]: { gte: value } };
    case 'less_than_or_equals':
      return { [field]: { lte: value } };
    default:
      return {};
  }
}

function buildJsonCondition(
  path: string[],
  operator: string,
  value: unknown
): Record<string, unknown> {
  switch (operator) {
    case 'equals':
      return { properties: { path, equals: value } };
    case 'not_equals':
      return { NOT: { properties: { path, equals: value } } };
    case 'is_set':
      return { NOT: { properties: { path, equals: null } } };
    case 'is_not_set':
      return { properties: { path, equals: null } };
    default:
      return {};
  }
}

export function createSegmentCalculateWorker(): Worker<SegmentCalculateJobData> {
  const worker = new Worker(QUEUE_NAMES.SEGMENT_CALCULATE, processSegmentCalculate, {
    connection,
    concurrency: config.workers.concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`Segment calculate job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Segment calculate job ${job?.id} failed:`, err);
  });

  return worker;
}
