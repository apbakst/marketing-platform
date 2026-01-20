'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';

interface ConditionNodeData {
  label: string;
  conditions?: {
    operator: 'and' | 'or';
    conditions: Array<{
      field: string;
      operator: string;
      value?: unknown;
    }>;
  };
}

function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>) {
  const conditionCount = data.conditions?.conditions?.length || 0;

  return (
    <div
      className={`rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-purple-500'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-purple-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-purple-100 p-2">
          <GitBranch className="h-4 w-4 text-purple-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-purple-600">Condition</p>
          <p className="text-sm font-semibold">
            {data.label || `${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
      <div className="mt-2 flex justify-between gap-4 text-xs">
        <div className="flex flex-col items-center">
          <span className="text-green-600 font-medium">Yes</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            className="!bg-green-500 !w-3 !h-3 !relative !left-0 !transform-none"
            style={{ position: 'relative', left: 0, transform: 'none' }}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-red-600 font-medium">No</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            className="!bg-red-500 !w-3 !h-3 !relative !right-0 !transform-none"
            style={{ position: 'relative', left: 0, transform: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(ConditionNode);
