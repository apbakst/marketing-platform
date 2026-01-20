import { prisma, Prisma } from '@marketing-platform/database';
import { QUEUE_NAMES, generateId } from '@marketing-platform/shared';
import { Queue, Worker, Job } from 'bullmq';
import { connection } from '../lib/redis.js';
import { config } from '../lib/config.js';
import { ConditionEvaluator } from '../services/condition-evaluator.js';

// Flow node types
interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

const POLL_INTERVAL = 10000; // 10 seconds
let isRunning = false;
let pollTimer: NodeJS.Timeout | null = null;

const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, {
  connection: connection as any,
});

const smsSendQueue = new Queue(QUEUE_NAMES.SMS_SEND, {
  connection: connection as any,
});

async function processFlowEnrollments(): Promise<void> {
  const now = new Date();

  // Find enrollments that need processing
  const enrollments = await prisma.flowEnrollment.findMany({
    where: {
      status: 'active',
      nextActionAt: { lte: now },
    },
    include: {
      flow: true,
      profile: true,
    },
    take: 100, // Process in batches
  });

  if (enrollments.length === 0) {
    return;
  }

  console.log(`Processing ${enrollments.length} flow enrollments`);

  for (const enrollment of enrollments) {
    try {
      await processEnrollment(enrollment);
    } catch (error) {
      console.error(`Error processing enrollment ${enrollment.id}:`, error);

      // Mark as failed if there's an error
      await prisma.flowEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'failed',
          exitedAt: now,
          exitReason: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
}

async function processEnrollment(enrollment: {
  id: string;
  flowId: string;
  profileId: string;
  currentNodeId: string | null;
  metadata: Prisma.JsonValue;
  flow: {
    id: string;
    organizationId: string;
    nodes: Prisma.JsonValue;
    edges: Prisma.JsonValue;
    settings: Prisma.JsonValue;
    status: string;
  };
  profile: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    properties: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  };
}): Promise<void> {
  const { flow, profile } = enrollment;

  // Check if flow is still active
  if (flow.status !== 'active') {
    await exitEnrollment(enrollment.id, 'flow_paused');
    return;
  }

  if (!enrollment.currentNodeId) {
    await exitEnrollment(enrollment.id, 'no_current_node');
    return;
  }

  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];
  const currentNode = nodes.find(n => n.id === enrollment.currentNodeId);

  if (!currentNode) {
    await exitEnrollment(enrollment.id, 'node_not_found');
    return;
  }

  const metadata = enrollment.metadata as Record<string, unknown>;
  const visitedNodes = (metadata.visitedNodes as string[]) || [];
  const completedNodes = (metadata.completedNodes as string[]) || [];

  // Mark node as visited
  if (!visitedNodes.includes(currentNode.id)) {
    visitedNodes.push(currentNode.id);
  }

  // Process the current node
  const result = await processNode(currentNode, enrollment, flow, profile);

  // Mark node as completed
  if (!completedNodes.includes(currentNode.id)) {
    completedNodes.push(currentNode.id);
  }

  // Find next node
  let nextNodeId: string | null = null;
  let nextActionAt: Date | null = null;

  if (result.nextNodeId) {
    nextNodeId = result.nextNodeId;
  } else if (result.edgeLabel) {
    // Find edge by label (for condition/split nodes)
    const edge = edges.find(
      e => e.source === currentNode.id && e.label === result.edgeLabel
    );
    nextNodeId = edge?.target || null;
  } else {
    // Find default next edge
    const edge = edges.find(e => e.source === currentNode.id);
    nextNodeId = edge?.target || null;
  }

  // Calculate next action time
  if (nextNodeId) {
    const nextNode = nodes.find(n => n.id === nextNodeId);
    if (nextNode?.type === 'delay') {
      nextActionAt = calculateDelayTime(nextNode.data);
    } else {
      nextActionAt = new Date(); // Immediate
    }
  }

  // Update enrollment
  if (nextNodeId) {
    await prisma.flowEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentNodeId: nextNodeId,
        nextActionAt,
        metadata: {
          ...metadata,
          visitedNodes,
          completedNodes,
          lastProcessedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } else {
    // No next node - flow completed
    await prisma.flowEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: 'completed',
        currentNodeId: null,
        nextActionAt: null,
        exitedAt: new Date(),
        exitReason: 'completed',
        metadata: {
          ...metadata,
          visitedNodes,
          completedNodes,
          completedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.flow.update({
      where: { id: flow.id },
      data: {
        activeCount: { decrement: 1 },
        completedCount: { increment: 1 },
      },
    });
  }
}

async function processNode(
  node: FlowNode,
  enrollment: { id: string; flowId: string; profileId: string },
  flow: { id: string; organizationId: string; settings: Prisma.JsonValue },
  profile: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    properties: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<{ nextNodeId?: string; edgeLabel?: string }> {
  switch (node.type) {
    case 'trigger':
      // Trigger nodes are entry points, just pass through
      return {};

    case 'delay':
      // Delay is handled by nextActionAt calculation
      return {};

    case 'email':
      await sendFlowEmail(node, enrollment, flow, profile);
      return {};

    case 'sms':
      await sendFlowSms(node, enrollment, flow, profile);
      return {};

    case 'condition':
      return await evaluateCondition(node, profile);

    case 'split':
      return evaluateSplit(node);

    case 'update_profile':
      await updateProfile(node, profile);
      return {};

    case 'add_tag':
      await addTag(node, profile);
      return {};

    case 'remove_tag':
      await removeTag(node, profile);
      return {};

    case 'webhook':
      await callWebhook(node, enrollment, profile);
      return {};

    case 'exit':
      return { nextNodeId: undefined };

    default:
      console.warn(`Unknown node type: ${node.type}`);
      return {};
  }
}

function calculateDelayTime(data: Record<string, unknown>): Date {
  const amount = (data.amount as number) || 1;
  const unit = (data.unit as string) || 'hours';

  const now = new Date();
  switch (unit) {
    case 'minutes':
      return new Date(now.getTime() + amount * 60 * 1000);
    case 'hours':
      return new Date(now.getTime() + amount * 60 * 60 * 1000);
    case 'days':
      return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
    case 'weeks':
      return new Date(now.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + amount * 60 * 60 * 1000);
  }
}

async function sendFlowEmail(
  node: FlowNode,
  enrollment: { id: string; flowId: string; profileId: string },
  flow: { id: string; organizationId: string; settings: Prisma.JsonValue },
  profile: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    properties: Prisma.JsonValue;
  }
): Promise<void> {
  if (!profile.email) {
    console.log(`Profile ${profile.id} has no email, skipping flow email`);
    return;
  }

  const { templateId, subject, fromEmail, fromName } = node.data as {
    templateId?: string;
    subject?: string;
    fromEmail?: string;
    fromName?: string;
  };

  // Get template if specified
  let htmlContent = (node.data.htmlContent as string) || '';
  let textContent = (node.data.textContent as string) || '';

  if (templateId) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
    });
    if (template) {
      htmlContent = template.htmlContent || htmlContent;
      textContent = template.textContent || textContent;
    }
  }

  if (!htmlContent) {
    console.log(`Node ${node.id} has no email content, skipping`);
    return;
  }

  // Get default provider
  const defaultProvider = await prisma.emailProvider.findFirst({
    where: { organizationId: flow.organizationId, isActive: true },
    orderBy: { priority: 'asc' },
  });

  if (!defaultProvider) {
    throw new Error('No active email provider configured');
  }

  // Get organization settings
  const organization = await prisma.organization.findUnique({
    where: { id: flow.organizationId },
  });

  const settings = (organization?.settings as Record<string, unknown>) || {};
  const baseUrl = (settings.trackingDomain as string) || process.env.API_URL || 'http://localhost:3001';

  // Simple template rendering
  const templateVars = {
    email: profile.email,
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    ...(profile.properties as Record<string, unknown>),
  };

  const renderedSubject = renderSimpleTemplate(subject || 'Message from us', templateVars);
  const renderedHtml = renderSimpleTemplate(htmlContent, templateVars);
  const renderedText = textContent ? renderSimpleTemplate(textContent, templateVars) : undefined;

  const emailSendId = generateId('es');

  // Create email send record
  await prisma.emailSend.create({
    data: {
      id: emailSendId,
      organizationId: flow.organizationId,
      profileId: profile.id,
      flowId: flow.id,
      flowNodeId: node.id,
      providerId: defaultProvider.id,
      toEmail: profile.email,
      fromEmail: fromEmail || (settings.defaultFromEmail as string) || 'noreply@example.com',
      fromName: fromName || (settings.defaultFromName as string) || organization?.name || '',
      subject: renderedSubject,
      status: 'queued',
    },
  });

  // Queue the email
  await emailSendQueue.add(
    `flow-${flow.id}-${node.id}-${profile.id}`,
    {
      emailSendId,
      organizationId: flow.organizationId,
      profileId: profile.id,
      to: profile.email,
      from: {
        email: fromEmail || (settings.defaultFromEmail as string) || 'noreply@example.com',
        name: fromName || (settings.defaultFromName as string) || organization?.name || '',
      },
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
      flowId: flow.id,
      flowNodeId: node.id,
      tags: ['flow', flow.id],
    }
  );
}

function renderSimpleTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => {
    const value = vars[key.trim()];
    return value !== undefined && value !== null ? String(value) : '';
  });
}

async function sendFlowSms(
  node: FlowNode,
  enrollment: { id: string; flowId: string; profileId: string },
  flow: { id: string; organizationId: string; settings: Prisma.JsonValue },
  profile: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    properties: Prisma.JsonValue;
  }
): Promise<void> {
  // Get profile phone number
  const fullProfile = await prisma.profile.findUnique({
    where: { id: profile.id },
    select: { phone: true },
  });

  const phone = fullProfile?.phone;
  if (!phone) {
    console.log(`Profile ${profile.id} has no phone number, skipping flow SMS`);
    return;
  }

  // Check SMS consent
  const consent = await prisma.smsConsent.findUnique({
    where: {
      organizationId_phone: {
        organizationId: flow.organizationId,
        phone,
      },
    },
  });

  if (!consent || !consent.consentGiven || consent.optedOutAt) {
    console.log(`No SMS consent for ${phone}, skipping flow SMS`);
    return;
  }

  const { message, mediaUrl } = node.data as {
    message?: string;
    mediaUrl?: string;
  };

  if (!message) {
    console.log(`Node ${node.id} has no SMS message, skipping`);
    return;
  }

  // Get default SMS provider
  const smsProvider = await prisma.smsProvider.findFirst({
    where: { organizationId: flow.organizationId, isActive: true },
    orderBy: { priority: 'asc' },
  });

  if (!smsProvider) {
    console.log('No active SMS provider configured, skipping flow SMS');
    return;
  }

  // Simple template rendering
  const templateVars = {
    phone,
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    ...(profile.properties as Record<string, unknown>),
  };

  const renderedMessage = renderSimpleTemplate(message, templateVars);

  const smsSendId = generateId('sms');

  // Create SMS send record
  await prisma.smsSend.create({
    data: {
      id: smsSendId,
      organizationId: flow.organizationId,
      profileId: profile.id,
      flowId: flow.id,
      flowNodeId: node.id,
      providerId: smsProvider.id,
      fromNumber: smsProvider.fromNumber,
      toNumber: phone,
      body: renderedMessage,
      mediaUrl: mediaUrl || null,
      status: 'queued',
    },
  });

  // Queue the SMS
  await smsSendQueue.add(
    `flow-sms-${flow.id}-${node.id}-${profile.id}`,
    {
      smsSendId,
      organizationId: flow.organizationId,
      profileId: profile.id,
      to: phone,
      body: renderedMessage,
      mediaUrl,
      flowId: flow.id,
      flowNodeId: node.id,
    }
  );

  console.log(`Queued SMS for flow ${flow.id}, profile ${profile.id}`);
}

async function evaluateCondition(
  node: FlowNode,
  profile: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    properties: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }
): Promise<{ edgeLabel: string }> {
  const { conditions } = node.data as {
    conditions?: {
      operator: 'and' | 'or';
      conditions: Array<{
        type: 'property';
        field: string;
        operator: string;
        value?: unknown;
      }>;
    };
  };

  if (!conditions) {
    return { edgeLabel: 'yes' }; // Default to yes if no conditions
  }

  const evaluator = new ConditionEvaluator();
  const evaluationProfile = {
    id: profile.id,
    email: profile.email,
    phone: null,
    firstName: profile.firstName,
    lastName: profile.lastName,
    properties: profile.properties as Record<string, unknown>,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };

  const result = evaluator.evaluate(evaluationProfile, conditions as any);
  return { edgeLabel: result ? 'yes' : 'no' };
}

function evaluateSplit(node: FlowNode): { edgeLabel: string } {
  const { splitType, variants } = node.data as {
    splitType?: 'random' | 'percentage';
    variants?: Array<{ id: string; percentage: number }>;
  };

  if (!variants || variants.length === 0) {
    return { edgeLabel: 'A' };
  }

  if (splitType === 'percentage') {
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const variant of variants) {
      cumulative += variant.percentage;
      if (random < cumulative) {
        return { edgeLabel: variant.id };
      }
    }
  }

  // Random selection
  const randomIndex = Math.floor(Math.random() * variants.length);
  return { edgeLabel: variants[randomIndex].id };
}

async function updateProfile(
  node: FlowNode,
  profile: { id: string; properties: Prisma.JsonValue }
): Promise<void> {
  const { updates } = node.data as {
    updates?: Array<{ field: string; value: unknown }>;
  };

  if (!updates || updates.length === 0) return;

  const currentProperties = profile.properties as Record<string, unknown>;
  const newProperties = { ...currentProperties };

  for (const update of updates) {
    if (update.field.startsWith('properties.')) {
      const propKey = update.field.replace('properties.', '');
      newProperties[propKey] = update.value;
    }
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      properties: newProperties as unknown as Prisma.InputJsonValue,
    },
  });
}

async function addTag(
  node: FlowNode,
  profile: { id: string; properties: Prisma.JsonValue }
): Promise<void> {
  const { tag } = node.data as { tag?: string };
  if (!tag) return;

  const properties = profile.properties as Record<string, unknown>;
  const tags = (properties.tags as string[]) || [];

  if (!tags.includes(tag)) {
    tags.push(tag);

    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        properties: {
          ...properties,
          tags,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function removeTag(
  node: FlowNode,
  profile: { id: string; properties: Prisma.JsonValue }
): Promise<void> {
  const { tag } = node.data as { tag?: string };
  if (!tag) return;

  const properties = profile.properties as Record<string, unknown>;
  const tags = (properties.tags as string[]) || [];
  const index = tags.indexOf(tag);

  if (index > -1) {
    tags.splice(index, 1);

    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        properties: {
          ...properties,
          tags,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function callWebhook(
  node: FlowNode,
  enrollment: { id: string; flowId: string; profileId: string },
  profile: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    properties: Prisma.JsonValue;
  }
): Promise<void> {
  const { url, method, headers } = node.data as {
    url?: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
  };

  if (!url) return;

  try {
    await fetch(url, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      body: JSON.stringify({
        enrollmentId: enrollment.id,
        flowId: enrollment.flowId,
        profile: {
          id: profile.id,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          properties: profile.properties,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error(`Webhook call failed for node ${node.id}:`, error);
  }
}

async function exitEnrollment(enrollmentId: string, reason: string): Promise<void> {
  const enrollment = await prisma.flowEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: 'exited',
      exitedAt: new Date(),
      exitReason: reason,
      nextActionAt: null,
    },
    include: { flow: true },
  });

  await prisma.flow.update({
    where: { id: enrollment.flowId },
    data: {
      activeCount: { decrement: 1 },
    },
  });
}

async function pollLoop(): Promise<void> {
  if (!isRunning) return;

  try {
    await processFlowEnrollments();
  } catch (error) {
    console.error('Error in flow executor poll loop:', error);
  }

  if (isRunning) {
    pollTimer = setTimeout(pollLoop, POLL_INTERVAL);
  }
}

// Worker for handling flow execution jobs (triggered by flow-trigger worker)
export interface FlowExecuteJobData {
  enrollmentId: string;
}

async function processFlowExecuteJob(job: Job<FlowExecuteJobData>): Promise<void> {
  // This worker handles immediate execution requests from the flow trigger
  // The main processing is handled by the polling mechanism
  console.log(`Flow execute job ${job.id} for enrollment ${job.data.enrollmentId}`);
  // The polling mechanism will pick this up
}

export function createFlowExecutorWorker(): Worker<FlowExecuteJobData> {
  const worker = new Worker(QUEUE_NAMES.FLOW_EXECUTE, processFlowExecuteJob, {
    connection,
    concurrency: config.workers.concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`Flow execute job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Flow execute job ${job?.id} failed:`, err);
  });

  return worker;
}

export function startFlowExecutor(): void {
  if (isRunning) {
    console.warn('Flow executor is already running');
    return;
  }

  isRunning = true;
  console.log('Flow executor started');
  console.log(`Polling interval: ${POLL_INTERVAL / 1000} seconds`);

  pollLoop();
}

export function stopFlowExecutor(): void {
  isRunning = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log('Flow executor stopped');
}

export async function closeFlowExecutor(): Promise<void> {
  stopFlowExecutor();
  await emailSendQueue.close();
  await smsSendQueue.close();
}
