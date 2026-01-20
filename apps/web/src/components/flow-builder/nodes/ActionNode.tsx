'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { UserCog, Tag, Webhook, X } from 'lucide-react';

interface ActionNodeData {
  label: string;
  actionType: 'update_profile' | 'add_tag' | 'remove_tag' | 'webhook' | 'exit';
  tag?: string;
  url?: string;
  updates?: Array<{ field: string; value: unknown }>;
}

const actionIcons: Record<string, React.ElementType> = {
  update_profile: UserCog,
  add_tag: Tag,
  remove_tag: Tag,
  webhook: Webhook,
  exit: X,
};

const actionLabels: Record<string, string> = {
  update_profile: 'Update Profile',
  add_tag: 'Add Tag',
  remove_tag: 'Remove Tag',
  webhook: 'Webhook',
  exit: 'Exit Flow',
};

const actionColors: Record<string, { border: string; bg: string; text: string }> = {
  update_profile: { border: 'border-teal-500', bg: 'bg-teal-100', text: 'text-teal-600' },
  add_tag: { border: 'border-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-600' },
  remove_tag: { border: 'border-rose-500', bg: 'bg-rose-100', text: 'text-rose-600' },
  webhook: { border: 'border-cyan-500', bg: 'bg-cyan-100', text: 'text-cyan-600' },
  exit: { border: 'border-gray-500', bg: 'bg-gray-100', text: 'text-gray-600' },
};

function ActionNode({ data, selected }: NodeProps<ActionNodeData>) {
  const Icon = actionIcons[data.actionType] || UserCog;
  const colors = actionColors[data.actionType] || actionColors.update_profile;
  const isExit = data.actionType === 'exit';

  let subtitle = '';
  if (data.tag) subtitle = data.tag;
  else if (data.url) subtitle = data.url;
  else if (data.updates?.length) subtitle = `${data.updates.length} update(s)`;

  return (
    <div
      className={`rounded-lg border-2 bg-white px-4 py-3 shadow-sm ${
        selected ? 'border-primary ring-2 ring-primary/20' : colors.border
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3`}
        style={{ backgroundColor: colors.border.replace('border-', '').replace('-500', '') }}
      />
      <div className="flex items-center gap-2">
        <div className={`rounded-full ${colors.bg} p-2`}>
          <Icon className={`h-4 w-4 ${colors.text}`} />
        </div>
        <div>
          <p className={`text-xs font-medium ${colors.text}`}>
            {actionLabels[data.actionType]}
          </p>
          <p className="text-sm font-semibold max-w-[150px] truncate">
            {data.label || subtitle || actionLabels[data.actionType]}
          </p>
        </div>
      </div>
      {!isExit && (
        <Handle
          type="source"
          position={Position.Bottom}
          className={`!w-3 !h-3`}
          style={{ backgroundColor: colors.border.replace('border-', '').replace('-500', '') }}
        />
      )}
    </div>
  );
}

export default memo(ActionNode);
