'use client';

import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Mock data for demonstration
const mockSegments = [
  {
    id: 'seg_1',
    name: 'Premium Users',
    description: 'Users on the premium plan',
    memberCount: 1234,
    isActive: true,
    lastCalculatedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'seg_2',
    name: 'New Signups (7d)',
    description: 'Users who signed up in the last 7 days',
    memberCount: 456,
    isActive: true,
    lastCalculatedAt: '2024-01-15T10:25:00Z',
  },
  {
    id: 'seg_3',
    name: 'Inactive Users',
    description: 'Users who have not been active in 30 days',
    memberCount: 789,
    isActive: true,
    lastCalculatedAt: '2024-01-15T10:20:00Z',
  },
  {
    id: 'seg_4',
    name: 'High Value Customers',
    description: 'Customers with lifetime value > $500',
    memberCount: 234,
    isActive: false,
    lastCalculatedAt: '2024-01-14T15:00:00Z',
  },
];

export default function SegmentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Segments</h1>
          <p className="text-muted-foreground">
            Create and manage dynamic audience segments
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Segment
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockSegments.map((segment) => (
          <Card
            key={segment.id}
            className={segment.isActive ? '' : 'opacity-60'}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{segment.name}</CardTitle>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    segment.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {segment.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <CardDescription>{segment.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {segment.memberCount.toLocaleString()}
                  </span>
                  <span className="text-sm text-muted-foreground">members</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Last updated:{' '}
                {new Date(segment.lastCalculatedAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
