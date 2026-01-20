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
  id: string;
  type: 'property';
  field: string;
  operator: ComparisonOperator;
  value?: string | number | boolean | string[];
}

export interface DateCondition {
  id: string;
  type: 'date';
  field: string;
  operator: DateOperator;
  value?: string | number;
  value2?: string;
}

export interface EventCondition {
  id: string;
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
}

export type Condition = PropertyCondition | DateCondition | EventCondition;

export interface ConditionGroup {
  id: string;
  operator: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

export type SegmentDefinition = ConditionGroup;

export const PROPERTY_FIELDS = [
  { value: 'email', label: 'Email', type: 'string' },
  { value: 'firstName', label: 'First Name', type: 'string' },
  { value: 'lastName', label: 'Last Name', type: 'string' },
  { value: 'phone', label: 'Phone', type: 'string' },
  { value: 'createdAt', label: 'Created Date', type: 'date' },
  { value: 'properties.plan', label: 'Plan', type: 'string' },
  { value: 'properties.signupSource', label: 'Signup Source', type: 'string' },
];

export const STRING_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
];

export const NUMBER_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'greater_than_or_equals', label: 'is greater than or equals' },
  { value: 'less_than', label: 'is less than' },
  { value: 'less_than_or_equals', label: 'is less than or equals' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
];

export const DATE_OPERATORS = [
  { value: 'before', label: 'is before' },
  { value: 'after', label: 'is after' },
  { value: 'between', label: 'is between' },
  { value: 'in_last_days', label: 'is in the last X days' },
  { value: 'not_in_last_days', label: 'is not in the last X days' },
  { value: 'on_date', label: 'is on' },
];

export const EVENT_OPERATORS = [
  { value: 'has_done', label: 'has done' },
  { value: 'has_not_done', label: 'has not done' },
];

export const COUNT_OPERATORS = [
  { value: 'at_least', label: 'at least' },
  { value: 'at_most', label: 'at most' },
  { value: 'exactly', label: 'exactly' },
];

export const TIMEFRAME_OPTIONS = [
  { value: 'ever', label: 'ever' },
  { value: 'in_last_days', label: 'in the last X days' },
  { value: 'between', label: 'between dates' },
];
