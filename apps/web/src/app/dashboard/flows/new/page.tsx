'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Node, Edge } from 'reactflow';
import { ArrowLeft, Save, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FlowBuilder from '@/components/flow-builder/FlowBuilder';
import { api } from '@/lib/api';

const initialNodes: Node[] = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 250, y: 50 },
    data: {
      label: 'Trigger',
      triggerType: 'event',
      eventName: '',
    },
  },
];

const initialEdges: Edge[] = [];

export default function NewFlowPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('event');
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);

  const handleFlowChange = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    setNodes(newNodes);
    setEdges(newEdges);

    // Update trigger type from trigger node
    const triggerNode = newNodes.find((n) => n.type === 'trigger');
    if (triggerNode?.data?.triggerType) {
      setTriggerType(triggerNode.data.triggerType as string);
    }
  }, []);

  const getTriggerConfig = () => {
    const triggerNode = nodes.find((n) => n.type === 'trigger');
    if (!triggerNode) return { type: triggerType };

    const data = triggerNode.data as Record<string, unknown>;
    return {
      type: data.triggerType || triggerType,
      eventName: data.eventName,
      segmentId: data.segmentId,
      dateProperty: data.dateProperty,
      filters: data.filters,
    };
  };

  const handleSave = async (activate = false) => {
    if (!name) {
      alert('Please enter a flow name');
      return;
    }

    const triggerNode = nodes.find((n) => n.type === 'trigger');
    if (!triggerNode) {
      alert('Flow must have a trigger node');
      return;
    }

    setSaving(true);
    if (activate) setActivating(true);

    try {
      const flowData = {
        name,
        description,
        triggerType,
        triggerConfig: getTriggerConfig(),
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          label: e.label,
        })),
      };

      const response = await api.createFlow(flowData);

      if (activate && response.id) {
        await api.activateFlow(response.id);
      }

      router.push('/dashboard/flows');
    } catch (error) {
      console.error('Error saving flow:', error);
      alert('Error saving flow. Please try again.');
    } finally {
      setSaving(false);
      setActivating(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4 bg-white">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/flows')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-4">
            <div>
              <Label htmlFor="name" className="sr-only">
                Flow Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Flow name"
                className="text-lg font-semibold w-64"
              />
            </div>
            <div>
              <Label htmlFor="description" className="sr-only">
                Description
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-64"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving && !activating ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            <Play className="mr-2 h-4 w-4" />
            {activating ? 'Activating...' : 'Save & Activate'}
          </Button>
        </div>
      </div>

      {/* Flow Builder */}
      <div className="flex-1">
        <FlowBuilder
          initialNodes={nodes}
          initialEdges={edges}
          onChange={handleFlowChange}
        />
      </div>
    </div>
  );
}
