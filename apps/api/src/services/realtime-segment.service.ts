import { prisma, Prisma } from '@marketing-platform/database';
import { redis } from '../lib/redis.js';
import { QUEUE_NAMES, generateId } from '@marketing-platform/shared';
import { Queue } from 'bullmq';

const flowTriggerQueue = new Queue(QUEUE_NAMES.FLOW_TRIGGER, {
  connection: redis as any,
});

interface SegmentCondition {
  type: 'property' | 'event' | 'date';
  field?: string;
  eventName?: string;
  operator: string;
  value?: unknown;
  value2?: unknown;
  count?: { operator: string; value: number };
  timeframe?: { type: string; days?: number };
}

interface SegmentDefinition {
  conditions: SegmentCondition[];
  operator: 'and' | 'or';
}

export class RealtimeSegmentService {
  /**
   * Evaluate all segments for a profile when their data changes
   * Returns segment IDs that the profile entered/exited
   */
  async evaluateProfileSegments(
    profileId: string,
    organizationId: string
  ): Promise<{ entered: string[]; exited: string[] }> {
    // Get all segments for the organization
    const segments = await prisma.segment.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        conditions: true,
      },
    });

    // Get current memberships
    const currentMemberships = await prisma.segmentMembership.findMany({
      where: { profileId, exitedAt: null },
      select: { segmentId: true },
    });
    const currentSegmentIds = new Set(currentMemberships.map(m => m.segmentId));

    // Get profile data
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        properties: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!profile) {
      return { entered: [], exited: [] };
    }

    // Get recent events for this profile
    const recentEvents = await prisma.event.findMany({
      where: { profileId },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    const entered: string[] = [];
    const exited: string[] = [];

    for (const segment of segments) {
      // Conditions JSON format: { operator: 'and'|'or', conditions: SegmentCondition[] }
      const conditionsData = segment.conditions as { operator?: string; conditions?: unknown[] } | null;
      const definition: SegmentDefinition = {
        conditions: (conditionsData?.conditions as SegmentCondition[]) || [],
        operator: (conditionsData?.operator as 'and' | 'or') || 'and',
      };

      const matches = await this.evaluateSegmentConditions(
        profile,
        recentEvents,
        definition
      );

      const wasInSegment = currentSegmentIds.has(segment.id);

      if (matches && !wasInSegment) {
        // Profile entered segment
        await this.addToSegment(profileId, segment.id);
        entered.push(segment.id);
      } else if (!matches && wasInSegment) {
        // Profile exited segment
        await this.removeFromSegment(profileId, segment.id);
        exited.push(segment.id);
      }
    }

    // Trigger flows for segment entry/exit
    if (entered.length > 0 || exited.length > 0) {
      await this.triggerSegmentFlows(profileId, organizationId, entered, exited);
    }

    return { entered, exited };
  }

  /**
   * Evaluate a single segment's conditions for a profile
   */
  private async evaluateSegmentConditions(
    profile: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      properties: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
    },
    events: Array<{ name: string; timestamp: Date; properties: Prisma.JsonValue }>,
    definition: SegmentDefinition
  ): Promise<boolean> {
    const { conditions, operator } = definition;

    if (conditions.length === 0) {
      return false;
    }

    const results: boolean[] = [];

    for (const condition of conditions) {
      let matches = false;

      if (condition.type === 'property') {
        matches = this.evaluatePropertyCondition(profile, condition);
      } else if (condition.type === 'event') {
        matches = this.evaluateEventCondition(events, condition);
      } else if (condition.type === 'date') {
        matches = this.evaluateDateCondition(profile, condition);
      }

      results.push(matches);
    }

    if (operator === 'and') {
      return results.every(r => r);
    } else {
      return results.some(r => r);
    }
  }

  /**
   * Evaluate a property condition
   */
  private evaluatePropertyCondition(
    profile: {
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      properties: Prisma.JsonValue;
    },
    condition: SegmentCondition
  ): boolean {
    const { field, operator, value } = condition;
    if (!field) return false;

    // Get the field value from profile
    let fieldValue: unknown;
    const standardFields: Record<string, unknown> = {
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
    };

    if (field in standardFields) {
      fieldValue = standardFields[field];
    } else {
      const props = profile.properties as Record<string, unknown>;
      fieldValue = props?.[field];
    }

    return this.compareValues(fieldValue, operator, value);
  }

  /**
   * Evaluate an event condition
   */
  private evaluateEventCondition(
    events: Array<{ name: string; timestamp: Date; properties: Prisma.JsonValue }>,
    condition: SegmentCondition
  ): boolean {
    const { eventName, operator, timeframe, count } = condition;
    if (!eventName) return false;

    // Filter events by name and timeframe
    let matchingEvents = events.filter(e => e.name === eventName);

    if (timeframe?.type === 'in_last_days' && timeframe.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - timeframe.days);
      matchingEvents = matchingEvents.filter(e => e.timestamp >= cutoff);
    }

    const eventCount = matchingEvents.length;

    // Check if event exists based on operator
    if (operator === 'has_done') {
      if (count) {
        return this.compareValues(eventCount, count.operator, count.value);
      }
      return eventCount > 0;
    } else if (operator === 'has_not_done') {
      return eventCount === 0;
    }

    return false;
  }

  /**
   * Evaluate a date condition
   */
  private evaluateDateCondition(
    profile: { createdAt: Date; updatedAt: Date },
    condition: SegmentCondition
  ): boolean {
    const { field, operator, value, value2 } = condition;
    if (!field) return false;

    let dateValue: Date | null = null;
    if (field === 'createdAt') {
      dateValue = profile.createdAt;
    } else if (field === 'updatedAt') {
      dateValue = profile.updatedAt;
    }

    if (!dateValue) return false;

    const now = new Date();

    switch (operator) {
      case 'is_set':
        return true;
      case 'is_not_set':
        return false;
      case 'before':
        return value ? dateValue < new Date(value as string) : false;
      case 'after':
        return value ? dateValue > new Date(value as string) : false;
      case 'in_last_days':
        const lastDays = new Date();
        lastDays.setDate(lastDays.getDate() - (value as number));
        return dateValue >= lastDays;
      case 'not_in_last_days':
        const notLastDays = new Date();
        notLastDays.setDate(notLastDays.getDate() - (value as number));
        return dateValue < notLastDays;
      case 'between':
        if (!value || !value2) return false;
        return dateValue >= new Date(value as string) && dateValue <= new Date(value2 as string);
      default:
        return false;
    }
  }

  /**
   * Compare values with an operator
   */
  private compareValues(fieldValue: unknown, operator: string, compareValue: unknown): boolean {
    const strFieldValue = fieldValue != null ? String(fieldValue).toLowerCase() : '';
    const strCompareValue = compareValue != null ? String(compareValue).toLowerCase() : '';

    switch (operator) {
      case 'equals':
        return strFieldValue === strCompareValue;
      case 'not_equals':
        return strFieldValue !== strCompareValue;
      case 'contains':
        return strFieldValue.includes(strCompareValue);
      case 'not_contains':
        return !strFieldValue.includes(strCompareValue);
      case 'starts_with':
        return strFieldValue.startsWith(strCompareValue);
      case 'ends_with':
        return strFieldValue.endsWith(strCompareValue);
      case 'is_set':
        return fieldValue != null && fieldValue !== '';
      case 'is_not_set':
        return fieldValue == null || fieldValue === '';
      case 'greater_than':
        return Number(fieldValue) > Number(compareValue);
      case 'less_than':
        return Number(fieldValue) < Number(compareValue);
      case 'greater_than_or_equal':
        return Number(fieldValue) >= Number(compareValue);
      case 'less_than_or_equal':
        return Number(fieldValue) <= Number(compareValue);
      case 'at_least':
        return Number(fieldValue) >= Number(compareValue);
      case 'at_most':
        return Number(fieldValue) <= Number(compareValue);
      case 'exactly':
        return Number(fieldValue) === Number(compareValue);
      default:
        return false;
    }
  }

  /**
   * Add a profile to a segment
   */
  private async addToSegment(profileId: string, segmentId: string): Promise<void> {
    // Check if already a member
    const existing = await prisma.segmentMembership.findFirst({
      where: { profileId, segmentId, exitedAt: null },
    });

    if (existing) return;

    await prisma.segmentMembership.create({
      data: {
        id: generateId('sm'),
        profileId,
        segmentId,
        enteredAt: new Date(),
      },
    });

    // Update segment member count
    await prisma.segment.update({
      where: { id: segmentId },
      data: { memberCount: { increment: 1 } },
    });
  }

  /**
   * Remove a profile from a segment
   */
  private async removeFromSegment(profileId: string, segmentId: string): Promise<void> {
    const membership = await prisma.segmentMembership.findFirst({
      where: { profileId, segmentId, exitedAt: null },
    });

    if (!membership) return;

    await prisma.segmentMembership.update({
      where: { id: membership.id },
      data: { exitedAt: new Date() },
    });

    // Update segment member count
    await prisma.segment.update({
      where: { id: segmentId },
      data: { memberCount: { decrement: 1 } },
    });
  }

  /**
   * Trigger flows based on segment entry/exit
   */
  private async triggerSegmentFlows(
    profileId: string,
    organizationId: string,
    enteredSegments: string[],
    exitedSegments: string[]
  ): Promise<void> {
    // Find flows with segment triggers
    const flows = await prisma.flow.findMany({
      where: {
        organizationId,
        status: 'active',
        triggerType: { in: ['segment_entry', 'segment_exit'] },
      },
      select: {
        id: true,
        triggerType: true,
        triggerSegmentId: true,
      },
    });

    for (const flow of flows) {
      const shouldTrigger =
        (flow.triggerType === 'segment_entry' && flow.triggerSegmentId && enteredSegments.includes(flow.triggerSegmentId)) ||
        (flow.triggerType === 'segment_exit' && flow.triggerSegmentId && exitedSegments.includes(flow.triggerSegmentId));

      if (shouldTrigger) {
        await flowTriggerQueue.add(`flow-${flow.id}-${profileId}`, {
          flowId: flow.id,
          profileId,
          triggerType: flow.triggerType,
          triggerData: { segmentId: flow.triggerSegmentId },
        });
      }
    }
  }

  /**
   * Evaluate segments for a specific event
   * Called when a new event is tracked
   */
  async evaluateSegmentsForEvent(
    profileId: string,
    organizationId: string,
    eventName: string
  ): Promise<{ entered: string[]; exited: string[] }> {
    // Find segments that have conditions on this event
    const segments = await prisma.segment.findMany({
      where: {
        organizationId,
        conditions: {
          path: [],
          array_contains: [{ type: 'event' }],
        },
      },
    });

    if (segments.length === 0) {
      return { entered: [], exited: [] };
    }

    // Filter to only segments that reference this event
    const relevantSegments = segments.filter(segment => {
      const conditionsData = segment.conditions as { conditions?: SegmentCondition[] } | null;
      const conditions = conditionsData?.conditions || [];
      return conditions.some(c => c.type === 'event' && c.eventName === eventName);
    });

    if (relevantSegments.length === 0) {
      return { entered: [], exited: [] };
    }

    // Get current memberships for relevant segments
    const currentMemberships = await prisma.segmentMembership.findMany({
      where: {
        profileId,
        segmentId: { in: relevantSegments.map(s => s.id) },
        exitedAt: null,
      },
      select: { segmentId: true },
    });
    const currentSegmentIds = new Set(currentMemberships.map(m => m.segmentId));

    // Get profile and events
    const [profile, events] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          properties: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.event.findMany({
        where: { profileId },
        orderBy: { timestamp: 'desc' },
        take: 1000,
      }),
    ]);

    if (!profile) {
      return { entered: [], exited: [] };
    }

    const entered: string[] = [];
    const exited: string[] = [];

    for (const segment of relevantSegments) {
      const conditionsData = segment.conditions as { operator?: string; conditions?: unknown[] } | null;
      const definition: SegmentDefinition = {
        conditions: (conditionsData?.conditions as SegmentCondition[]) || [],
        operator: (conditionsData?.operator as 'and' | 'or') || 'and',
      };

      const matches = await this.evaluateSegmentConditions(profile, events, definition);
      const wasInSegment = currentSegmentIds.has(segment.id);

      if (matches && !wasInSegment) {
        await this.addToSegment(profileId, segment.id);
        entered.push(segment.id);
      } else if (!matches && wasInSegment) {
        await this.removeFromSegment(profileId, segment.id);
        exited.push(segment.id);
      }
    }

    // Trigger flows
    if (entered.length > 0 || exited.length > 0) {
      await this.triggerSegmentFlows(profileId, organizationId, entered, exited);
    }

    return { entered, exited };
  }
}

export const realtimeSegmentService = new RealtimeSegmentService();
