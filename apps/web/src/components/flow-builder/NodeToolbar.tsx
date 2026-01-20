'use client';

import {
  Zap,
  Clock,
  Mail,
  GitBranch,
  Shuffle,
  UserCog,
  Tag,
  Webhook,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface NodeToolbarProps {
  onAddNode: (type: string) => void;
}

const nodeTypes = [
  {
    group: 'Timing',
    items: [
      { type: 'delay', label: 'Delay', icon: Clock, color: 'text-orange-500' },
    ],
  },
  {
    group: 'Actions',
    items: [
      { type: 'email', label: 'Send Email', icon: Mail, color: 'text-blue-500' },
      { type: 'webhook', label: 'Webhook', icon: Webhook, color: 'text-cyan-500' },
    ],
  },
  {
    group: 'Logic',
    items: [
      { type: 'condition', label: 'Condition', icon: GitBranch, color: 'text-purple-500' },
      { type: 'split', label: 'A/B Split', icon: Shuffle, color: 'text-pink-500' },
    ],
  },
  {
    group: 'Profile',
    items: [
      { type: 'update_profile', label: 'Update Profile', icon: UserCog, color: 'text-teal-500' },
      { type: 'add_tag', label: 'Add Tag', icon: Tag, color: 'text-indigo-500' },
      { type: 'remove_tag', label: 'Remove Tag', icon: Tag, color: 'text-rose-500' },
    ],
  },
  {
    group: 'Flow Control',
    items: [
      { type: 'exit', label: 'Exit Flow', icon: X, color: 'text-gray-500' },
    ],
  },
];

export function NodeToolbar({ onAddNode }: NodeToolbarProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="shadow-md">
          <Zap className="mr-2 h-4 w-4" />
          Add Node
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {nodeTypes.map((group, groupIndex) => (
          <div key={group.group}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{group.group}</DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.type}
                onClick={() => onAddNode(item.type)}
                className="cursor-pointer"
              >
                <item.icon className={`mr-2 h-4 w-4 ${item.color}`} />
                {item.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
