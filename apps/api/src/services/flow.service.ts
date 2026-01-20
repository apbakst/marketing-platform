import { prisma, Flow, FlowEnrollment, Prisma } from '@marketing-platform/database';
import { generateId } from '@marketing-platform/shared';

// Flow node types
export type FlowNodeType =
  | 'trigger'
  | 'delay'
  | 'email'
  | 'condition'
  | 'split'
  | 'update_profile'
  | 'add_tag'
  | 'remove_tag'
  | 'webhook'
  | 'exit';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

export interface TriggerConfig {
  type: 'event' | 'segment_entry' | 'segment_exit' | 'date_property' | 'manual';
  eventName?: string;
  segmentId?: string;
  dateProperty?: string;
  dateOffset?: number;
  dateOffsetUnit?: 'hours' | 'days' | 'weeks';
  filters?: Array<{
    field: string;
    operator: string;
    value?: unknown;
  }>;
}

export interface CreateFlowInput {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: TriggerConfig;
  triggerSegmentId?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  settings?: Record<string, unknown>;
}

export interface UpdateFlowInput {
  name?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: TriggerConfig;
  triggerSegmentId?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  settings?: Record<string, unknown>;
  status?: 'draft' | 'active' | 'paused' | 'archived';
}

export class FlowService {
  async create(organizationId: string, input: CreateFlowInput): Promise<Flow> {
    const flow = await prisma.flow.create({
      data: {
        id: generateId('flow'),
        organizationId,
        name: input.name,
        description: input.description,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig as unknown as Prisma.InputJsonValue,
        triggerSegmentId: input.triggerSegmentId,
        nodes: (input.nodes || []) as unknown as Prisma.InputJsonValue,
        edges: (input.edges || []) as unknown as Prisma.InputJsonValue,
        settings: (input.settings || {}) as unknown as Prisma.InputJsonValue,
      },
    });

    return flow;
  }

  async update(
    organizationId: string,
    flowId: string,
    input: UpdateFlowInput
  ): Promise<Flow> {
    const existing = await prisma.flow.findUnique({
      where: { id: flowId },
    });

    if (!existing || existing.organizationId !== organizationId) {
      throw new Error('Flow not found');
    }

    // Can only edit draft or paused flows
    if (existing.status === 'active' && input.nodes !== undefined) {
      throw new Error('Cannot modify nodes of an active flow. Pause it first.');
    }

    const updateData: Prisma.FlowUpdateInput = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.triggerType !== undefined) updateData.triggerType = input.triggerType;
    if (input.triggerConfig !== undefined) {
      updateData.triggerConfig = input.triggerConfig as unknown as Prisma.InputJsonValue;
    }
    if (input.triggerSegmentId !== undefined) {
      updateData.triggerSegment = input.triggerSegmentId
        ? { connect: { id: input.triggerSegmentId } }
        : { disconnect: true };
    }
    if (input.nodes !== undefined) {
      updateData.nodes = input.nodes as unknown as Prisma.InputJsonValue;
    }
    if (input.edges !== undefined) {
      updateData.edges = input.edges as unknown as Prisma.InputJsonValue;
    }
    if (input.settings !== undefined) {
      updateData.settings = input.settings as unknown as Prisma.InputJsonValue;
    }
    if (input.status !== undefined) updateData.status = input.status;

    const flow = await prisma.flow.update({
      where: { id: flowId },
      data: updateData,
    });

    return flow;
  }

  async getById(organizationId: string, flowId: string): Promise<Flow | null> {
    return prisma.flow.findFirst({
      where: {
        id: flowId,
        organizationId,
      },
    });
  }

  async list(
    organizationId: string,
    options: {
      status?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{ flows: Flow[]; nextCursor?: string }> {
    const limit = Math.min(options.limit || 50, 200);

    const flows = await prisma.flow.findMany({
      where: {
        organizationId,
        ...(options.status && { status: options.status }),
      },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (flows.length > limit) {
      const next = flows.pop();
      nextCursor = next?.id;
    }

    return { flows, nextCursor };
  }

  async delete(organizationId: string, flowId: string): Promise<void> {
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, organizationId },
    });

    if (!flow) {
      throw new Error('Flow not found');
    }

    if (flow.status === 'active') {
      throw new Error('Cannot delete an active flow. Pause or archive it first.');
    }

    await prisma.flow.delete({
      where: { id: flowId },
    });
  }

  async activate(organizationId: string, flowId: string): Promise<Flow> {
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, organizationId },
    });

    if (!flow) {
      throw new Error('Flow not found');
    }

    // Validate flow has required nodes
    const nodes = flow.nodes as unknown as FlowNode[];
    if (!nodes || nodes.length === 0) {
      throw new Error('Flow must have at least one node');
    }

    const triggerNode = nodes.find(n => n.type === 'trigger');
    if (!triggerNode) {
      throw new Error('Flow must have a trigger node');
    }

    return prisma.flow.update({
      where: { id: flowId },
      data: { status: 'active' },
    });
  }

  async pause(organizationId: string, flowId: string): Promise<Flow> {
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, organizationId },
    });

    if (!flow) {
      throw new Error('Flow not found');
    }

    return prisma.flow.update({
      where: { id: flowId },
      data: { status: 'paused' },
    });
  }

  async getStats(organizationId: string, flowId: string): Promise<{
    totalEnrolled: number;
    active: number;
    completed: number;
    exited: number;
    nodeStats: Record<string, { entered: number; completed: number }>;
  }> {
    const flow = await prisma.flow.findFirst({
      where: { id: flowId, organizationId },
    });

    if (!flow) {
      throw new Error('Flow not found');
    }

    const [active, completed, exited] = await Promise.all([
      prisma.flowEnrollment.count({
        where: { flowId, status: 'active' },
      }),
      prisma.flowEnrollment.count({
        where: { flowId, status: 'completed' },
      }),
      prisma.flowEnrollment.count({
        where: { flowId, status: 'exited' },
      }),
    ]);

    // Get node-level stats from metadata
    const enrollments = await prisma.flowEnrollment.findMany({
      where: { flowId },
      select: { metadata: true },
    });

    const nodeStats: Record<string, { entered: number; completed: number }> = {};
    const nodes = flow.nodes as unknown as FlowNode[];

    for (const node of nodes) {
      nodeStats[node.id] = { entered: 0, completed: 0 };
    }

    for (const enrollment of enrollments) {
      const metadata = enrollment.metadata as Record<string, unknown>;
      const visitedNodes = (metadata.visitedNodes as string[]) || [];
      const completedNodes = (metadata.completedNodes as string[]) || [];

      for (const nodeId of visitedNodes) {
        if (nodeStats[nodeId]) {
          nodeStats[nodeId].entered++;
        }
      }

      for (const nodeId of completedNodes) {
        if (nodeStats[nodeId]) {
          nodeStats[nodeId].completed++;
        }
      }
    }

    return {
      totalEnrolled: flow.totalEnrolled,
      active,
      completed,
      exited,
      nodeStats,
    };
  }

  async enrollProfile(
    flowId: string,
    profileId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<FlowEnrollment> {
    const flow = await prisma.flow.findUnique({
      where: { id: flowId },
    });

    if (!flow || flow.status !== 'active') {
      throw new Error('Flow not found or not active');
    }

    // Check if already enrolled
    const existing = await prisma.flowEnrollment.findUnique({
      where: {
        flowId_profileId: { flowId, profileId },
      },
    });

    if (existing && existing.status === 'active') {
      throw new Error('Profile is already enrolled in this flow');
    }

    // Find the first node after trigger
    const nodes = flow.nodes as unknown as FlowNode[];
    const edges = flow.edges as unknown as FlowEdge[];
    const triggerNode = nodes.find(n => n.type === 'trigger');

    if (!triggerNode) {
      throw new Error('Flow has no trigger node');
    }

    const firstEdge = edges.find(e => e.source === triggerNode.id);
    const firstNodeId = firstEdge?.target || null;

    // Calculate next action time (immediate for first node)
    const nextActionAt = new Date();

    if (existing) {
      // Re-enroll
      return prisma.flowEnrollment.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          currentNodeId: firstNodeId,
          nextActionAt,
          exitedAt: null,
          exitReason: null,
          metadata: {
            ...metadata,
            visitedNodes: [],
            completedNodes: [],
            reenrolledAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const enrollment = await prisma.flowEnrollment.create({
      data: {
        id: generateId('fe'),
        flowId,
        profileId,
        currentNodeId: firstNodeId,
        nextActionAt,
        metadata: {
          ...metadata,
          visitedNodes: [],
          completedNodes: [],
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // Update flow stats
    await prisma.flow.update({
      where: { id: flowId },
      data: {
        totalEnrolled: { increment: 1 },
        activeCount: { increment: 1 },
      },
    });

    return enrollment;
  }

  async getEnrollments(
    flowId: string,
    options: {
      status?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{ enrollments: FlowEnrollment[]; nextCursor?: string }> {
    const limit = Math.min(options.limit || 50, 200);

    const enrollments = await prisma.flowEnrollment.findMany({
      where: {
        flowId,
        ...(options.status && { status: options.status }),
      },
      include: {
        profile: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      orderBy: { enteredAt: 'desc' },
    });

    let nextCursor: string | undefined;
    if (enrollments.length > limit) {
      const next = enrollments.pop();
      nextCursor = next?.id;
    }

    return { enrollments, nextCursor };
  }

  async exitEnrollment(
    enrollmentId: string,
    reason: string
  ): Promise<FlowEnrollment> {
    const enrollment = await prisma.flowEnrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    const updated = await prisma.flowEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'exited',
        exitedAt: new Date(),
        exitReason: reason,
        nextActionAt: null,
      },
    });

    // Update flow stats
    await prisma.flow.update({
      where: { id: enrollment.flowId },
      data: {
        activeCount: { decrement: 1 },
      },
    });

    return updated;
  }
}

export const flowService = new FlowService();
