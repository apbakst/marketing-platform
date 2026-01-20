'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Shuffle } from 'lucide-react';

interface SplitNodeData {
  label: string;
  splitType: 'random' | 'percentage';
  variants: Array<{
    id: string;
    percentage: number;
  }>;
}

function SplitNode({ data, selected }: NodeProps<SplitNodeData>) {
  const variants = data.variants || [
    { id: 'A', percentage: 50 },
    { id: 'B', percentage: 50 },
  ];

  return (
    <div
      className={`rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-pink-500'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-pink-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-pink-100 p-2">
          <Shuffle className="h-4 w-4 text-pink-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-pink-600">A/B Split</p>
          <p className="text-sm font-semibold">{data.label || 'Random Split'}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-around text-xs">
        {variants.map((variant) => (
          <div key={variant.id} className="flex flex-col items-center">
            <span className="text-pink-600 font-medium">
              {variant.id} ({variant.percentage}%)
            </span>
            <Handle
              type="source"
              position={Position.Bottom}
              id={variant.id}
              className="!bg-pink-500 !w-3 !h-3 !relative !transform-none"
              style={{ position: 'relative', transform: 'none' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(SplitNode);
