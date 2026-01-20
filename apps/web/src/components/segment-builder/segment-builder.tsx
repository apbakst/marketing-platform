'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConditionRow } from './condition-row';
import {
  Condition,
  ConditionGroup,
  SegmentDefinition,
  LogicalOperator,
  PropertyCondition,
} from './types';

interface SegmentBuilderProps {
  value: SegmentDefinition;
  onChange: (value: SegmentDefinition) => void;
  eventNames?: string[];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function createDefaultCondition(): PropertyCondition {
  return {
    id: generateId(),
    type: 'property',
    field: 'email',
    operator: 'contains',
    value: '',
  };
}

function createDefaultGroup(): ConditionGroup {
  return {
    id: generateId(),
    operator: 'and',
    conditions: [createDefaultCondition()],
  };
}

interface ConditionGroupComponentProps {
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  onRemove?: () => void;
  isRoot?: boolean;
  eventNames?: string[];
}

function ConditionGroupComponent({
  group,
  onChange,
  onRemove,
  isRoot = false,
  eventNames = [],
}: ConditionGroupComponentProps) {
  const handleOperatorChange = (operator: LogicalOperator) => {
    onChange({ ...group, operator });
  };

  const handleConditionChange = (index: number, condition: Condition | ConditionGroup) => {
    const newConditions = [...group.conditions];
    newConditions[index] = condition;
    onChange({ ...group, conditions: newConditions });
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    if (newConditions.length === 0 && !isRoot) {
      onRemove?.();
    } else {
      onChange({ ...group, conditions: newConditions });
    }
  };

  const handleAddCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createDefaultCondition()],
    });
  };

  const handleAddGroup = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createDefaultGroup()],
    });
  };

  const isConditionGroup = (item: Condition | ConditionGroup): item is ConditionGroup => {
    return 'conditions' in item;
  };

  return (
    <div className={`space-y-2 ${!isRoot ? 'pl-4 border-l-2 border-primary/30' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-muted-foreground">Match</span>
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => handleOperatorChange('and')}
            className={`px-3 py-1 text-sm transition-colors ${
              group.operator === 'and'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
          >
            ALL
          </button>
          <button
            type="button"
            onClick={() => handleOperatorChange('or')}
            className={`px-3 py-1 text-sm transition-colors ${
              group.operator === 'or'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
          >
            ANY
          </button>
        </div>
        <span className="text-sm text-muted-foreground">of the following conditions</span>
        {!isRoot && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove} className="ml-auto">
            Remove group
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {group.conditions.map((condition, index) => (
          <div key={condition.id}>
            {index > 0 && (
              <div className="flex items-center gap-2 my-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  {group.operator}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            {isConditionGroup(condition) ? (
              <Card className="p-4 bg-muted/30">
                <ConditionGroupComponent
                  group={condition}
                  onChange={(newGroup) => handleConditionChange(index, newGroup)}
                  onRemove={() => handleRemoveCondition(index)}
                  eventNames={eventNames}
                />
              </Card>
            ) : (
              <ConditionRow
                condition={condition}
                onChange={(newCondition) => handleConditionChange(index, newCondition)}
                onRemove={() => handleRemoveCondition(index)}
                eventNames={eventNames}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="outline" size="sm" onClick={handleAddCondition}>
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
            className="mr-1"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add condition
        </Button>
        <Button variant="outline" size="sm" onClick={handleAddGroup}>
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
            className="mr-1"
          >
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <path d="M12 11v6M9 14h6" />
          </svg>
          Add group
        </Button>
      </div>
    </div>
  );
}

export function SegmentBuilder({ value, onChange, eventNames = [] }: SegmentBuilderProps) {
  // Ensure we have a valid initial value
  const [definition, setDefinition] = useState<SegmentDefinition>(() => {
    if (value && value.conditions && value.conditions.length > 0) {
      return value;
    }
    return createDefaultGroup();
  });

  const handleChange = useCallback(
    (newDefinition: SegmentDefinition) => {
      setDefinition(newDefinition);
      onChange(newDefinition);
    },
    [onChange]
  );

  return (
    <div className="space-y-4">
      <ConditionGroupComponent
        group={definition}
        onChange={handleChange}
        isRoot
        eventNames={eventNames}
      />
    </div>
  );
}

export { createDefaultGroup, type SegmentDefinition };
