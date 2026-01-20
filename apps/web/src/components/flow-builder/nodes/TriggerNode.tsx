'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap, Calendar, Users, MousePointer } from 'lucide-react';

interface TriggerNodeData {
  label: string;
  triggerType: 'event' | 'segment_entry' | 'segment_exit' | 'date_property' | 'manual';
  eventName?: string;
  segmentName?: string;
  dateProperty?: string;
}

const triggerIcons: Record<string, React.ElementType> = {
  event: MousePointer,
  segment_entry: Users,
  segment_exit: Users,
  date_property: Calendar,
  manual: Zap,
};

const triggerLabels: Record<string, string> = {
  event: 'Event Trigger',
  segment_entry: 'Segment Entry',
  segment_exit: 'Segment Exit',
  date_property: 'Date Property',
  manual: 'Manual Trigger',
};

function TriggerNode({ data, selected }: NodeProps<TriggerNodeData>) {
  const Icon = triggerIcons[data.triggerType] || Zap;
  const label = data.label || triggerLabels[data.triggerType] || 'Trigger';

  return (
    <div
      className={`rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-green-500'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-green-100 p-2">
          <Icon className="h-4 w-4 text-green-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-green-600">
            {triggerLabels[data.triggerType]}
          </p>
          <p className="text-sm font-semibold">
            {data.eventName || data.segmentName || data.dateProperty || label}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-green-500 !w-3 !h-3"
      />
    </div>
  );
}

export default memo(TriggerNode);
