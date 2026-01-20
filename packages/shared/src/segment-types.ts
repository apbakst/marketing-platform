// Segment condition types for the evaluator engine

export type ComparisonOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'greater_than_or_equals'
  | 'less_than'
  | 'less_than_or_equals'
  | 'is_set'
  | 'is_not_set'
  | 'in_list'
  | 'not_in_list';

export type DateOperator =
  | 'before'
  | 'after'
  | 'between'
  | 'in_last_days'
  | 'not_in_last_days'
  | 'on_date';

export type LogicalOperator = 'and' | 'or';

export interface PropertyCondition {
  type: 'property';
  field: string; // e.g., 'email', 'firstName', 'properties.plan'
  operator: ComparisonOperator;
  value?: string | number | boolean | string[] | number[];
}

export interface DateCondition {
  type: 'date';
  field: string; // e.g., 'createdAt', 'properties.lastPurchaseDate'
  operator: DateOperator;
  value?: string | number; // ISO date string or number of days
  value2?: string; // For 'between' operator
}

export interface EventCondition {
  type: 'event';
  eventName: string;
  operator: 'has_done' | 'has_not_done';
  timeframe?: {
    type: 'in_last_days' | 'between' | 'ever';
    days?: number;
    startDate?: string;
    endDate?: string;
  };
  count?: {
    operator: 'at_least' | 'at_most' | 'exactly';
    value: number;
  };
  properties?: PropertyCondition[];
}

export interface SegmentCondition {
  type: 'segment';
  segmentId: string;
  operator: 'is_member' | 'is_not_member';
}

export type Condition =
  | PropertyCondition
  | DateCondition
  | EventCondition
  | SegmentCondition;

export interface ConditionGroup {
  operator: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

export interface SegmentDefinition {
  operator: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

// Profile type for evaluation
export interface EvaluationProfile {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Event type for evaluation
export interface EvaluationEvent {
  name: string;
  properties: Record<string, unknown>;
  timestamp: Date;
}
