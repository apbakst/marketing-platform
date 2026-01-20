'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Play, Pause, GitBranch, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';

interface Flow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  triggerType: string;
  totalEnrolled: number;
  activeCount: number;
  completedCount: number;
  createdAt: string;
  updatedAt: string;
}

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

function getTriggerLabel(triggerType: string) {
  const labels: Record<string, string> = {
    event: 'Event Trigger',
    segment_entry: 'Segment Entry',
    segment_exit: 'Segment Exit',
    date_property: 'Date Property',
    manual: 'Manual Trigger',
  };
  return labels[triggerType] || triggerType;
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFlows();
  }, []);

  async function loadFlows() {
    try {
      const response = await api.getFlows();
      setFlows(response.flows || []);
    } catch (error) {
      console.error('Error loading flows:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(flowId: string) {
    try {
      await api.activateFlow(flowId);
      loadFlows();
    } catch (error) {
      console.error('Error activating flow:', error);
      alert('Failed to activate flow');
    }
  }

  async function handlePause(flowId: string) {
    try {
      await api.pauseFlow(flowId);
      loadFlows();
    } catch (error) {
      console.error('Error pausing flow:', error);
      alert('Failed to pause flow');
    }
  }

  async function handleDelete(flowId: string) {
    if (!confirm('Are you sure you want to delete this flow?')) return;

    try {
      await api.deleteFlow(flowId);
      loadFlows();
    } catch (error) {
      console.error('Error deleting flow:', error);
      alert('Failed to delete flow. Make sure the flow is not active.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading flows...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Flows</h1>
          <p className="text-muted-foreground">
            Create automated customer journeys
          </p>
        </div>
        <Link href="/dashboard/flows/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Flow
          </Button>
        </Link>
      </div>

      {flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No flows yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first automated flow to engage customers
            </p>
            <Link href="/dashboard/flows/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Flow
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {flows.map((flow) => (
            <Card key={flow.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{flow.name}</CardTitle>
                      <CardDescription>
                        {flow.description || 'No description'}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(flow.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium">Trigger:</span>
                    <span className="text-primary">
                      {getTriggerLabel(flow.triggerType)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 p-3">
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {flow.totalEnrolled.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Enrolled</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{flow.activeCount}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {flow.completedCount.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {flow.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePause(flow.id)}
                      >
                        <Pause className="mr-1 h-4 w-4" />
                        Pause
                      </Button>
                    )}
                    {(flow.status === 'paused' || flow.status === 'draft') && (
                      <Button size="sm" onClick={() => handleActivate(flow.id)}>
                        <Play className="mr-1 h-4 w-4" />
                        {flow.status === 'draft' ? 'Activate' : 'Resume'}
                      </Button>
                    )}
                    <Link href={`/dashboard/flows/${flow.id}/edit`}>
                      <Button variant="ghost" size="sm">
                        <Edit2 className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                    </Link>
                    {flow.status !== 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(flow.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
