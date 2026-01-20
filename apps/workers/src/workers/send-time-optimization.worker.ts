import { Worker, Job, Queue } from 'bullmq';
import { prisma } from '@marketing-platform/database';
import { QUEUE_NAMES } from '@marketing-platform/shared';
import { connection } from '../lib/redis.js';
import { config } from '../lib/config.js';

const BATCH_SIZE = 100;

interface SendTimeJobData {
  type: 'calculate_profile' | 'calculate_batch' | 'recalculate_organization';
  profileId?: string;
  organizationId?: string;
  profileIds?: string[];
}

interface HourlyEngagement {
  hour: number;
  opens: number;
  clicks: number;
  score: number;
}

const sendTimeQueue = new Queue<SendTimeJobData>('send-time-optimization', {
  connection,
});

/**
 * Calculate optimal send time for a single profile
 */
async function calculateProfileSendTime(profileId: string): Promise<void> {
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
    return; // Not enough data
  }

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
      hourData.score += 3;
    }
  }

  let bestHour = 9;
  let bestScore = 0;
  let totalScore = 0;

  for (const [hour, data] of hourlyEngagement) {
    totalScore += data.score;
    if (data.score > bestScore) {
      bestScore = data.score;
      bestHour = hour;
    }
  }

  const confidence = totalScore > 0 ? Math.min(bestScore / totalScore * 3, 1) : 0;

  // Check for day-of-week patterns
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

  // Store in profile properties
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
          optimalHour: bestHour,
          optimalDayOfWeek,
          confidence,
          lastCalculated: new Date().toISOString(),
        },
      },
    },
  });

  console.log(`[SendTimeOptimization] Calculated for profile ${profileId}: hour=${bestHour}, confidence=${confidence.toFixed(2)}`);
}

/**
 * Recalculate send times for all active profiles in an organization
 */
async function recalculateOrganization(organizationId: string): Promise<void> {
  console.log(`[SendTimeOptimization] Recalculating send times for organization ${organizationId}`);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Find profiles with engagement activity who need recalculation
  const profilesNeedingUpdate = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT p.id
    FROM profiles p
    INNER JOIN email_events ee ON ee.profile_id = p.id
    WHERE p.organization_id = ${organizationId}
    AND ee.timestamp >= ${sevenDaysAgo}
    AND (
      p.properties->>'_sendTimeOptimization' IS NULL
      OR (p.properties->'_sendTimeOptimization'->>'lastCalculated')::timestamp < ${sevenDaysAgo}
    )
    LIMIT 1000
  `;

  console.log(`[SendTimeOptimization] Found ${profilesNeedingUpdate.length} profiles to update`);

  // Process in batches
  for (let i = 0; i < profilesNeedingUpdate.length; i += BATCH_SIZE) {
    const batch = profilesNeedingUpdate.slice(i, i + BATCH_SIZE);
    await sendTimeQueue.add('batch', {
      type: 'calculate_batch',
      profileIds: batch.map(p => p.id),
    });
  }
}

/**
 * Process a batch of profiles
 */
async function processBatch(profileIds: string[]): Promise<void> {
  for (const profileId of profileIds) {
    try {
      await calculateProfileSendTime(profileId);
    } catch (error) {
      console.error(`[SendTimeOptimization] Error calculating for profile ${profileId}:`, error);
    }
  }
}

async function processSendTimeJob(job: Job<SendTimeJobData>): Promise<void> {
  const { type, profileId, organizationId, profileIds } = job.data;

  switch (type) {
    case 'calculate_profile':
      if (profileId) {
        await calculateProfileSendTime(profileId);
      }
      break;

    case 'calculate_batch':
      if (profileIds) {
        await processBatch(profileIds);
      }
      break;

    case 'recalculate_organization':
      if (organizationId) {
        await recalculateOrganization(organizationId);
      }
      break;

    default:
      console.warn(`[SendTimeOptimization] Unknown job type: ${type}`);
  }
}

export function createSendTimeOptimizationWorker(): Worker<SendTimeJobData> {
  const worker = new Worker('send-time-optimization', processSendTimeJob, {
    connection,
    concurrency: config.workers.concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`[SendTimeOptimization] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[SendTimeOptimization] Job ${job?.id} failed:`, error);
  });

  return worker;
}

/**
 * Schedule daily recalculation for all organizations
 */
export async function scheduleDailyRecalculation(): Promise<void> {
  const organizations = await prisma.organization.findMany({
    select: { id: true },
  });

  for (const org of organizations) {
    await sendTimeQueue.add(
      'daily-recalc',
      {
        type: 'recalculate_organization',
        organizationId: org.id,
      },
      {
        delay: Math.random() * 3600000, // Random delay up to 1 hour to spread load
      }
    );
  }
}

export { sendTimeQueue };
