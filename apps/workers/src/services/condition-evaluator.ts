import type {
  EvalCondition as Condition,
  EvalConditionGroup as ConditionGroup,
  EvalPropertyCondition as PropertyCondition,
  EvalDateCondition as DateCondition,
  EvalEventCondition as EventCondition,
  EvalSegmentCondition as SegmentCondition,
  SegmentDefinition,
  EvaluationProfile,
  EvaluationEvent,
} from '@marketing-platform/shared';

export class ConditionEvaluator {
  private events: EvaluationEvent[];
  private segmentMemberships: Set<string>;

  constructor(
    events: EvaluationEvent[] = [],
    segmentMemberships: string[] = []
  ) {
    this.events = events;
    this.segmentMemberships = new Set(segmentMemberships);
  }

  evaluate(profile: EvaluationProfile, definition: SegmentDefinition): boolean {
    return this.evaluateGroup(profile, definition);
  }

  private evaluateGroup(
    profile: EvaluationProfile,
    group: ConditionGroup | SegmentDefinition
  ): boolean {
    const results = group.conditions.map((condition) => {
      if ('operator' in condition && 'conditions' in condition) {
        return this.evaluateGroup(profile, condition as ConditionGroup);
      }
      return this.evaluateCondition(profile, condition as Condition);
    });

    if (group.operator === 'and') {
      return results.every((r) => r);
    }
    return results.some((r) => r);
  }

  private evaluateCondition(
    profile: EvaluationProfile,
    condition: Condition
  ): boolean {
    switch (condition.type) {
      case 'property':
        return this.evaluatePropertyCondition(profile, condition);
      case 'date':
        return this.evaluateDateCondition(profile, condition);
      case 'event':
        return this.evaluateEventCondition(condition);
      case 'segment':
        return this.evaluateSegmentCondition(condition);
      default:
        return false;
    }
  }

  private getFieldValue(profile: EvaluationProfile, field: string): unknown {
    const parts = field.split('.');
    let value: unknown = profile;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private evaluatePropertyCondition(
    profile: EvaluationProfile,
    condition: PropertyCondition
  ): boolean {
    const fieldValue = this.getFieldValue(profile, condition.field);
    const conditionValue = condition.value;

    switch (condition.operator) {
      case 'equals':
        return fieldValue === conditionValue;

      case 'not_equals':
        return fieldValue !== conditionValue;

      case 'contains':
        if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
          return fieldValue.toLowerCase().includes(conditionValue.toLowerCase());
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(conditionValue);
        }
        return false;

      case 'not_contains':
        if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
          return !fieldValue.toLowerCase().includes(conditionValue.toLowerCase());
        }
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(conditionValue);
        }
        return true;

      case 'starts_with':
        if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
          return fieldValue.toLowerCase().startsWith(conditionValue.toLowerCase());
        }
        return false;

      case 'ends_with':
        if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
          return fieldValue.toLowerCase().endsWith(conditionValue.toLowerCase());
        }
        return false;

      case 'greater_than':
        if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
          return fieldValue > conditionValue;
        }
        return false;

      case 'greater_than_or_equals':
        if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
          return fieldValue >= conditionValue;
        }
        return false;

      case 'less_than':
        if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
          return fieldValue < conditionValue;
        }
        return false;

      case 'less_than_or_equals':
        if (typeof fieldValue === 'number' && typeof conditionValue === 'number') {
          return fieldValue <= conditionValue;
        }
        return false;

      case 'is_set':
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';

      case 'is_not_set':
        return fieldValue === null || fieldValue === undefined || fieldValue === '';

      case 'in_list':
        if (Array.isArray(conditionValue)) {
          return (conditionValue as (string | number)[]).includes(fieldValue as string | number);
        }
        return false;

      case 'not_in_list':
        if (Array.isArray(conditionValue)) {
          return !(conditionValue as (string | number)[]).includes(fieldValue as string | number);
        }
        return true;

      default:
        return false;
    }
  }

  private evaluateDateCondition(
    profile: EvaluationProfile,
    condition: DateCondition
  ): boolean {
    const fieldValue = this.getFieldValue(profile, condition.field);
    if (!fieldValue) return false;

    const fieldDate = fieldValue instanceof Date ? fieldValue : new Date(fieldValue as string);
    if (isNaN(fieldDate.getTime())) return false;

    const now = new Date();

    switch (condition.operator) {
      case 'before':
        if (typeof condition.value === 'string') {
          const compareDate = new Date(condition.value);
          return fieldDate < compareDate;
        }
        return false;

      case 'after':
        if (typeof condition.value === 'string') {
          const compareDate = new Date(condition.value);
          return fieldDate > compareDate;
        }
        return false;

      case 'between':
        if (typeof condition.value === 'string' && typeof condition.value2 === 'string') {
          const startDate = new Date(condition.value);
          const endDate = new Date(condition.value2);
          return fieldDate >= startDate && fieldDate <= endDate;
        }
        return false;

      case 'in_last_days':
        if (typeof condition.value === 'number') {
          const daysAgo = new Date(now.getTime() - condition.value * 24 * 60 * 60 * 1000);
          return fieldDate >= daysAgo;
        }
        return false;

      case 'not_in_last_days':
        if (typeof condition.value === 'number') {
          const daysAgo = new Date(now.getTime() - condition.value * 24 * 60 * 60 * 1000);
          return fieldDate < daysAgo;
        }
        return false;

      case 'on_date':
        if (typeof condition.value === 'string') {
          const compareDate = new Date(condition.value);
          return (
            fieldDate.getFullYear() === compareDate.getFullYear() &&
            fieldDate.getMonth() === compareDate.getMonth() &&
            fieldDate.getDate() === compareDate.getDate()
          );
        }
        return false;

      default:
        return false;
    }
  }

  private evaluateEventCondition(condition: EventCondition): boolean {
    let matchingEvents = this.events.filter((e) => e.name === condition.eventName);

    // Apply timeframe filter
    if (condition.timeframe) {
      const now = new Date();
      switch (condition.timeframe.type) {
        case 'in_last_days':
          if (condition.timeframe.days) {
            const cutoff = new Date(now.getTime() - condition.timeframe.days * 24 * 60 * 60 * 1000);
            matchingEvents = matchingEvents.filter((e) => e.timestamp >= cutoff);
          }
          break;
        case 'between':
          if (condition.timeframe.startDate && condition.timeframe.endDate) {
            const start = new Date(condition.timeframe.startDate);
            const end = new Date(condition.timeframe.endDate);
            matchingEvents = matchingEvents.filter(
              (e) => e.timestamp >= start && e.timestamp <= end
            );
          }
          break;
        case 'ever':
          // No filter needed
          break;
      }
    }

    // Apply property filters
    if (condition.properties && condition.properties.length > 0) {
      matchingEvents = matchingEvents.filter((event) => {
        return condition.properties!.every((propCondition) => {
          const eventProfile = {
            id: '',
            email: null,
            phone: null,
            firstName: null,
            lastName: null,
            properties: event.properties,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          // Adjust field to look in properties
          const adjustedCondition = {
            ...propCondition,
            field: propCondition.field.startsWith('properties.')
              ? propCondition.field
              : `properties.${propCondition.field}`,
          };
          return this.evaluatePropertyCondition(eventProfile, adjustedCondition);
        });
      });
    }

    const count = matchingEvents.length;

    // Apply count filter
    if (condition.count) {
      switch (condition.count.operator) {
        case 'at_least':
          if (condition.operator === 'has_done') {
            return count >= condition.count.value;
          }
          return count < condition.count.value;
        case 'at_most':
          if (condition.operator === 'has_done') {
            return count <= condition.count.value && count > 0;
          }
          return count > condition.count.value || count === 0;
        case 'exactly':
          if (condition.operator === 'has_done') {
            return count === condition.count.value;
          }
          return count !== condition.count.value;
      }
    }

    // Default behavior without count
    if (condition.operator === 'has_done') {
      return count > 0;
    }
    return count === 0;
  }

  private evaluateSegmentCondition(condition: SegmentCondition): boolean {
    const isMember = this.segmentMemberships.has(condition.segmentId);
    if (condition.operator === 'is_member') {
      return isMember;
    }
    return !isMember;
  }
}

// Utility function for quick evaluation without events/segments
export function evaluateProfile(
  profile: EvaluationProfile,
  definition: SegmentDefinition
): boolean {
  const evaluator = new ConditionEvaluator();
  return evaluator.evaluate(profile, definition);
}
