import { Worker, Job } from 'bullmq';
import { prisma, Prisma } from '@marketing-platform/database';
import { QUEUE_NAMES, generateId } from '@marketing-platform/shared';
import { connection } from '../lib/redis.js';
import { config } from '../lib/config.js';
import { ConditionEvaluator } from '../services/condition-evaluator.js';

// Job types for flow triggers
export interface EventTriggerJobData {
  type: 'event';
  organizationId: string;
  profileId: string;
  eventName: string;
  eventProperties: Record<string, unknown>;
  timestamp: string;
}

export interface SegmentTriggerJobData {
  type: 'segment_entry' | 'segment_exit';
  organizationId: string;
  profileId: string;
  segmentId: string;
}

export type FlowTriggerJobData = EventTriggerJobData | SegmentTriggerJobData;

async function processFlowTrigger(job: Job<FlowTriggerJobData>): Promise<void> {
  const { data } = job;

  console.log(`Processing flow trigger: ${data.type} for profile ${data.profileId}`);

  // Find matching active flows
  const flows = await prisma.flow.findMany({
    where: {
      organizationId: data.organizationId,
      status: 'active',
      triggerType: data.type,
    },
  });

  if (flows.length === 0) {
    return;
  }

  // Get profile for condition evaluation
  const profile = await prisma.profile.findUnique({
    where: { id: data.profileId },
  });

  if (!profile) {
    console.log(`Profile ${data.profileId} not found`);
    return;
  }

  for (const flow of flows) {
    try {
      const triggerConfig = flow.triggerConfig as Record<string, unknown>;

      // Check if this trigger matches the flow's trigger config
      const matches = await matchesTrigger(data, triggerConfig, profile);

      if (matches) {
        await enrollProfileInFlow(flow.id, data.profileId, data);
      }
    } catch (error) {
      console.error(`Error processing flow ${flow.id}:`, error);
    }
  }
}

async function matchesTrigger(
  data: FlowTriggerJobData,
  triggerConfig: Record<string, unknown>,
  profile: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    properties: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<boolean> {
  switch (data.type) {
    case 'event':
      // Check event name matches
      if (triggerConfig.eventName && triggerConfig.eventName !== data.eventName) {
        return false;
      }

      // Check filters if present
      const filters = triggerConfig.filters as Array<{
        field: string;
        operator: string;
        value: unknown;
      }> | undefined;

      if (filters && filters.length > 0) {
        const evaluator = new ConditionEvaluator();
        const evaluationProfile = {
          id: profile.id,
          email: profile.email,
          phone: profile.phone,
          firstName: profile.firstName,
          lastName: profile.lastName,
          properties: {
            ...(profile.properties as Record<string, unknown>),
            event: data.eventProperties,
          },
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        };

        const conditions = {
          operator: 'and' as const,
          conditions: filters.map(f => ({
            type: 'property' as const,
            field: f.field,
            operator: f.operator,
            value: f.value,
          })),
        };

        return evaluator.evaluate(evaluationProfile, conditions as any);
      }

      return true;

    case 'segment_entry':
    case 'segment_exit':
      // Check segment ID matches
      return triggerConfig.segmentId === data.segmentId;

    default:
      return false;
  }
}

async function enrollProfileInFlow(
  flowId: string,
  profileId: string,
  triggerData: FlowTriggerJobData
): Promise<void> {
  const flow = await prisma.flow.findUnique({
    where: { id: flowId },
  });

  if (!flow || flow.status !== 'active') {
    return;
  }

  // Check if already enrolled
  const existing = await prisma.flowEnrollment.findUnique({
    where: {
      flowId_profileId: { flowId, profileId },
    },
  });

  if (existing && existing.status === 'active') {
    console.log(`Profile ${profileId} already enrolled in flow ${flowId}`);
    return;
  }

  // Find the first node after trigger
  const nodes = flow.nodes as unknown as Array<{
    id: string;
    type: string;
  }>;
  const edges = flow.edges as unknown as Array<{
    id: string;
    source: string;
    target: string;
  }>;

  const triggerNode = nodes.find(n => n.type === 'trigger');
  if (!triggerNode) {
    console.error(`Flow ${flowId} has no trigger node`);
    return;
  }

  const firstEdge = edges.find(e => e.source === triggerNode.id);
  const firstNodeId = firstEdge?.target || null;

  const metadata = {
    triggerType: triggerData.type,
    triggerData: triggerData,
    visitedNodes: [],
    completedNodes: [],
    enrolledAt: new Date().toISOString(),
  };

  if (existing) {
    // Re-enroll
    await prisma.flowEnrollment.update({
      where: { id: existing.id },
      data: {
        status: 'active',
        currentNodeId: firstNodeId,
        nextActionAt: new Date(),
        exitedAt: null,
        exitReason: null,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.flow.update({
      where: { id: flowId },
      data: {
        activeCount: { increment: 1 },
      },
    });
  } else {
    await prisma.flowEnrollment.create({
      data: {
        id: generateId('fe'),
        flowId,
        profileId,
        currentNodeId: firstNodeId,
        nextActionAt: new Date(),
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.flow.update({
      where: { id: flowId },
      data: {
        totalEnrolled: { increment: 1 },
        activeCount: { increment: 1 },
      },
    });
  }

  console.log(`Enrolled profile ${profileId} in flow ${flowId}`);
}

export function createFlowTriggerWorker(): Worker<FlowTriggerJobData> {
  const worker = new Worker(QUEUE_NAMES.FLOW_TRIGGER, processFlowTrigger, {
    connection,
    concurrency: config.workers.concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`Flow trigger job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Flow trigger job ${job?.id} failed:`, err);
  });

  return worker;
}
