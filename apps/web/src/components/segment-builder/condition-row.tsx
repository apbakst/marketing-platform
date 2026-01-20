'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect as Select } from '@/components/ui/native-select';
import {
  Condition,
  PropertyCondition,
  EventCondition,
  PROPERTY_FIELDS,
  STRING_OPERATORS,
  NUMBER_OPERATORS,
  DATE_OPERATORS,
  EVENT_OPERATORS,
  COUNT_OPERATORS,
  TIMEFRAME_OPTIONS,
  ComparisonOperator,
  DateOperator,
} from './types';

interface ConditionRowProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
  eventNames?: string[];
}

export function ConditionRow({
  condition,
  onChange,
  onRemove,
  eventNames = [],
}: ConditionRowProps) {
  const conditionTypeOptions = [
    { value: 'property', label: 'Profile Property' },
    { value: 'event', label: 'Event' },
    { value: 'date', label: 'Date' },
  ];

  const handleTypeChange = (type: string) => {
    if (type === 'property') {
      onChange({
        ...condition,
        type: 'property',
        field: 'email',
        operator: 'equals' as ComparisonOperator,
        value: '',
      } as PropertyCondition);
    } else if (type === 'event') {
      onChange({
        ...condition,
        type: 'event',
        eventName: eventNames[0] || '',
        operator: 'has_done',
      } as EventCondition);
    } else if (type === 'date') {
      onChange({
        ...condition,
        type: 'date',
        field: 'createdAt',
        operator: 'in_last_days' as DateOperator,
        value: 30,
      });
    }
  };

  const renderPropertyCondition = (cond: PropertyCondition) => {
    const fieldType =
      PROPERTY_FIELDS.find((f) => f.value === cond.field)?.type || 'string';
    const operators =
      fieldType === 'number' ? NUMBER_OPERATORS : STRING_OPERATORS;
    const needsValue = !['is_set', 'is_not_set'].includes(cond.operator);

    return (
      <>
        <Select
          value={cond.field}
          onChange={(e) =>
            onChange({ ...cond, field: e.target.value } as PropertyCondition)
          }
          options={PROPERTY_FIELDS}
          className="w-40"
        />
        <Select
          value={cond.operator}
          onChange={(e) =>
            onChange({
              ...cond,
              operator: e.target.value as ComparisonOperator,
            } as PropertyCondition)
          }
          options={operators}
          className="w-44"
        />
        {needsValue && (
          <Input
            value={String(cond.value || '')}
            onChange={(e) =>
              onChange({ ...cond, value: e.target.value } as PropertyCondition)
            }
            placeholder="Value"
            className="w-40"
          />
        )}
      </>
    );
  };

  const renderEventCondition = (cond: EventCondition) => {
    const eventOptions =
      eventNames.length > 0
        ? eventNames.map((name) => ({ value: name, label: name }))
        : [{ value: '', label: 'No events found' }];

    return (
      <>
        <Select
          value={cond.operator}
          onChange={(e) =>
            onChange({
              ...cond,
              operator: e.target.value as 'has_done' | 'has_not_done',
            } as EventCondition)
          }
          options={EVENT_OPERATORS}
          className="w-36"
        />
        <Input
          value={cond.eventName}
          onChange={(e) =>
            onChange({ ...cond, eventName: e.target.value } as EventCondition)
          }
          placeholder="Event name"
          className="w-44"
          list="event-names"
        />
        <datalist id="event-names">
          {eventOptions.map((opt) => (
            <option key={opt.value} value={opt.value} />
          ))}
        </datalist>
        <Select
          value={cond.timeframe?.type || 'ever'}
          onChange={(e) =>
            onChange({
              ...cond,
              timeframe: { ...cond.timeframe, type: e.target.value as any },
            } as EventCondition)
          }
          options={TIMEFRAME_OPTIONS}
          className="w-40"
        />
        {cond.timeframe?.type === 'in_last_days' && (
          <Input
            type="number"
            value={cond.timeframe?.days || 30}
            onChange={(e) =>
              onChange({
                ...cond,
                timeframe: {
                  ...cond.timeframe,
                  type: 'in_last_days',
                  days: parseInt(e.target.value) || 30,
                },
              } as EventCondition)
            }
            placeholder="Days"
            className="w-20"
          />
        )}
        {cond.count && (
          <>
            <Select
              value={cond.count.operator}
              onChange={(e) =>
                onChange({
                  ...cond,
                  count: {
                    ...cond.count!,
                    operator: e.target.value as any,
                  },
                } as EventCondition)
              }
              options={COUNT_OPERATORS}
              className="w-28"
            />
            <Input
              type="number"
              value={cond.count.value}
              onChange={(e) =>
                onChange({
                  ...cond,
                  count: {
                    ...cond.count!,
                    value: parseInt(e.target.value) || 1,
                  },
                } as EventCondition)
              }
              placeholder="Times"
              className="w-20"
            />
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (cond.count) {
              const { count, ...rest } = cond;
              onChange(rest as EventCondition);
            } else {
              onChange({
                ...cond,
                count: { operator: 'at_least', value: 1 },
              } as EventCondition);
            }
          }}
        >
          {cond.count ? '- Count' : '+ Count'}
        </Button>
      </>
    );
  };

  const renderDateCondition = (cond: any) => {
    const dateFields = PROPERTY_FIELDS.filter((f) => f.type === 'date');
    const needsValue = !['is_set', 'is_not_set'].includes(cond.operator);
    const needsDays = ['in_last_days', 'not_in_last_days'].includes(
      cond.operator
    );
    const needsDateRange = cond.operator === 'between';

    return (
      <>
        <Select
          value={cond.field}
          onChange={(e) => onChange({ ...cond, field: e.target.value })}
          options={dateFields}
          className="w-40"
        />
        <Select
          value={cond.operator}
          onChange={(e) =>
            onChange({ ...cond, operator: e.target.value as DateOperator })
          }
          options={DATE_OPERATORS}
          className="w-48"
        />
        {needsDays && (
          <Input
            type="number"
            value={cond.value || 30}
            onChange={(e) =>
              onChange({ ...cond, value: parseInt(e.target.value) || 30 })
            }
            placeholder="Days"
            className="w-20"
          />
        )}
        {needsValue && !needsDays && !needsDateRange && (
          <Input
            type="date"
            value={cond.value || ''}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            className="w-40"
          />
        )}
        {needsDateRange && (
          <>
            <Input
              type="date"
              value={cond.value || ''}
              onChange={(e) => onChange({ ...cond, value: e.target.value })}
              className="w-36"
            />
            <span className="text-sm text-muted-foreground">and</span>
            <Input
              type="date"
              value={cond.value2 || ''}
              onChange={(e) => onChange({ ...cond, value2: e.target.value })}
              className="w-36"
            />
          </>
        )}
      </>
    );
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
      <Select
        value={condition.type}
        onChange={(e) => handleTypeChange(e.target.value)}
        options={conditionTypeOptions}
        className="w-36"
      />

      {condition.type === 'property' &&
        renderPropertyCondition(condition as PropertyCondition)}
      {condition.type === 'event' &&
        renderEventCondition(condition as EventCondition)}
      {condition.type === 'date' && renderDateCondition(condition)}

      <Button variant="ghost" size="sm" onClick={onRemove} className="ml-auto">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </Button>
    </div>
  );
}
