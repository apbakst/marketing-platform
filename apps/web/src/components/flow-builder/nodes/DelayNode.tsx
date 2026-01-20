'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Clock } from 'lucide-react';

interface DelayNodeData {
  label: string;
  amount: number;
  unit: 'minutes' | 'hours' | 'days' | 'weeks';
}

function DelayNode({ data, selected }: NodeProps<DelayNodeData>) {
  const unitLabels: Record<string, string> = {
    minutes: 'minute',
    hours: 'hour',
    days: 'day',
    weeks: 'week',
  };

  const unit = unitLabels[data.unit] || 'hour';
  const plural = data.amount !== 1 ? 's' : '';

  return (
    <div
      className={`rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-orange-500'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-orange-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-orange-100 p-2">
          <Clock className="h-4 w-4 text-orange-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-orange-600">Delay</p>
          <p className="text-sm font-semibold">
            Wait {data.amount} {unit}{plural}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-orange-500 !w-3 !h-3"
      />
    </div>
  );
}

export default memo(DelayNode);
