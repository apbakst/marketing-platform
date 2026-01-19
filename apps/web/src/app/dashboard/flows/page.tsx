'use client';

import { Plus, Play, Pause, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const mockFlows = [
  {
    id: 'flow_1',
    name: 'Welcome Series',
    description: 'Automated welcome emails for new subscribers',
    status: 'active',
    triggerType: 'event',
    triggerName: 'Signed Up',
    stats: {
      totalEnrolled: 5432,
      activelyInFlow: 234,
      completed: 4891,
      converted: 1234,
    },
  },
  {
    id: 'flow_2',
    name: 'Abandoned Cart Recovery',
    description: 'Recover abandoned shopping carts',
    status: 'active',
    triggerType: 'event',
    triggerName: 'Cart Abandoned',
    stats: {
      totalEnrolled: 1234,
      activelyInFlow: 89,
      completed: 1000,
      converted: 234,
    },
  },
  {
    id: 'flow_3',
    name: 'Win-back Campaign',
    description: 'Re-engage inactive users',
    status: 'paused',
    triggerType: 'segment_entry',
    triggerName: 'Inactive Users',
    stats: {
      totalEnrolled: 789,
      activelyInFlow: 0,
      completed: 650,
      converted: 89,
    },
  },
  {
    id: 'flow_4',
    name: 'Birthday Celebration',
    description: 'Send birthday wishes and offers',
    status: 'draft',
    triggerType: 'date_property',
    triggerName: 'birthday',
    stats: null,
  },
];

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    archived: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.draft}`}
    >
      {status}
    </span>
  );
}

export default function FlowsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Flows</h1>
          <p className="text-muted-foreground">
            Create automated customer journeys
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Flow
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mockFlows.map((flow) => (
          <Card key={flow.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <GitBranch className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{flow.name}</CardTitle>
                    <CardDescription>{flow.description}</CardDescription>
                  </div>
                </div>
                {getStatusBadge(flow.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium">Trigger:</span>
                  <span className="capitalize">
                    {flow.triggerType.replace('_', ' ')}
                  </span>
                  <span className="text-primary">{flow.triggerName}</span>
                </div>

                {flow.stats && (
                  <div className="grid grid-cols-4 gap-4 rounded-lg bg-muted/50 p-3">
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {flow.stats.totalEnrolled.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Enrolled</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {flow.stats.activelyInFlow}
                      </p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {flow.stats.completed.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {flow.stats.converted.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Converted</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {flow.status === 'active' && (
                    <Button variant="outline" size="sm">
                      <Pause className="mr-1 h-4 w-4" />
                      Pause
                    </Button>
                  )}
                  {flow.status === 'paused' && (
                    <Button variant="outline" size="sm">
                      <Play className="mr-1 h-4 w-4" />
                      Resume
                    </Button>
                  )}
                  {flow.status === 'draft' && (
                    <Button size="sm">
                      <Play className="mr-1 h-4 w-4" />
                      Activate
                    </Button>
                  )}
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
