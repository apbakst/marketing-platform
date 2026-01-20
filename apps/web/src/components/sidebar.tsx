'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Tags,
  Send,
  GitBranch,
  BarChart3,
  Settings,
  Home,
  FileCode,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Profiles', href: '/dashboard/profiles', icon: Users },
  { name: 'Segments', href: '/dashboard/segments', icon: Tags },
  { name: 'Campaigns', href: '/dashboard/campaigns', icon: Send },
  { name: 'Templates', href: '/dashboard/templates', icon: FileCode },
  { name: 'Flows', href: '/dashboard/flows', icon: GitBranch },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Suppressions', href: '/dashboard/suppressions', icon: Ban },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Send className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">Marketing</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
