'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Mail } from 'lucide-react';

interface EmailNodeData {
  label: string;
  subject?: string;
  templateId?: string;
  templateName?: string;
}

function EmailNode({ data, selected }: NodeProps<EmailNodeData>) {
  return (
    <div
      className={`rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-blue-500'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3"
      />
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-blue-100 p-2">
          <Mail className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-blue-600">Send Email</p>
          <p className="text-sm font-semibold max-w-[150px] truncate">
            {data.subject || data.templateName || data.label || 'Email'}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3"
      />
    </div>
  );
}

export default memo(EmailNode);
