export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equals'
  | 'less_than_or_equals'
  | 'is_set'
  | 'is_not_set'
  | 'in'
  | 'not_in'
  | 'before'
  | 'after'
  | 'within_last'
  | 'not_within_last';

export interface PropertyCondition {
  type: 'property';
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface EventCondition {
  type: 'event';
  eventName: string;
  operator: 'has_done' | 'has_not_done' | 'done_count';
  count?: number;
  countOperator?: 'equals' | 'greater_than' | 'less_than';
  timeframe?: {
    unit: 'hours' | 'days' | 'weeks' | 'months';
    value: number;
  };
  propertyFilters?: PropertyCondition[];
}

export type SegmentCondition = PropertyCondition | EventCondition;

export interface ConditionGroup {
  operator: 'and' | 'or';
  conditions: (SegmentCondition | ConditionGroup)[];
}

export interface Segment {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  conditions: ConditionGroup;
  isActive: boolean;
  memberCount: number;
  lastCalculatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSegmentInput {
  name: string;
  description?: string;
  conditions: ConditionGroup;
}

export interface UpdateSegmentInput {
  name?: string;
  description?: string;
  conditions?: ConditionGroup;
  isActive?: boolean;
}
