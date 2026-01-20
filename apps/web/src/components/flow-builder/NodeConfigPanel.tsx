'use client';

import { Node } from 'reactflow';
import { X, Trash2 } from 'lucide-react';
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

interface NodeConfigPanelProps {
  node: Node;
  onUpdate: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: NodeConfigPanelProps) {
  const { type, data } = node;

  return (
    <div className="w-80 border-l bg-white p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Configure Node</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Label field for all nodes */}
        <div>
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={(data.label as string) || ''}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Node label"
          />
        </div>

        {/* Node-specific configuration */}
        {type === 'trigger' && <TriggerConfig data={data} onUpdate={onUpdate} />}
        {type === 'delay' && <DelayConfig data={data} onUpdate={onUpdate} />}
        {type === 'email' && <EmailConfig data={data} onUpdate={onUpdate} />}
        {type === 'condition' && <ConditionConfig data={data} onUpdate={onUpdate} />}
        {type === 'split' && <SplitConfig data={data} onUpdate={onUpdate} />}
        {(type === 'add_tag' || type === 'remove_tag') && (
          <TagConfig data={data} onUpdate={onUpdate} />
        )}
        {type === 'webhook' && <WebhookConfig data={data} onUpdate={onUpdate} />}
        {type === 'update_profile' && <UpdateProfileConfig data={data} onUpdate={onUpdate} />}

        {/* Delete button */}
        {type !== 'trigger' && (
          <div className="pt-4 border-t">
            <Button variant="destructive" onClick={onDelete} className="w-full">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Node
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TriggerConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div>
        <Label htmlFor="triggerType">Trigger Type</Label>
        <Select
          value={(data.triggerType as string) || 'event'}
          onValueChange={(value) => onUpdate({ triggerType: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="event">Event</SelectItem>
            <SelectItem value="segment_entry">Segment Entry</SelectItem>
            <SelectItem value="segment_exit">Segment Exit</SelectItem>
            <SelectItem value="date_property">Date Property</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {data.triggerType === 'event' && (
        <div>
          <Label htmlFor="eventName">Event Name</Label>
          <Input
            id="eventName"
            value={(data.eventName as string) || ''}
            onChange={(e) => onUpdate({ eventName: e.target.value })}
            placeholder="e.g., Placed Order"
          />
        </div>
      )}
      {(data.triggerType === 'segment_entry' || data.triggerType === 'segment_exit') && (
        <div>
          <Label htmlFor="segmentId">Segment ID</Label>
          <Input
            id="segmentId"
            value={(data.segmentId as string) || ''}
            onChange={(e) => onUpdate({ segmentId: e.target.value })}
            placeholder="Segment ID"
          />
        </div>
      )}
      {data.triggerType === 'date_property' && (
        <div>
          <Label htmlFor="dateProperty">Date Property</Label>
          <Input
            id="dateProperty"
            value={(data.dateProperty as string) || ''}
            onChange={(e) => onUpdate({ dateProperty: e.target.value })}
            placeholder="e.g., birthday"
          />
        </div>
      )}
    </>
  );
}

function DelayConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div>
        <Label htmlFor="amount">Delay Amount</Label>
        <Input
          id="amount"
          type="number"
          min={1}
          value={(data.amount as number) || 1}
          onChange={(e) => onUpdate({ amount: parseInt(e.target.value) || 1 })}
        />
      </div>
      <div>
        <Label htmlFor="unit">Unit</Label>
        <Select
          value={(data.unit as string) || 'hours'}
          onValueChange={(value) => onUpdate({ unit: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">Minutes</SelectItem>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="days">Days</SelectItem>
            <SelectItem value="weeks">Weeks</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function EmailConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div>
        <Label htmlFor="subject">Subject Line</Label>
        <Input
          id="subject"
          value={(data.subject as string) || ''}
          onChange={(e) => onUpdate({ subject: e.target.value })}
          placeholder="Email subject"
        />
      </div>
      <div>
        <Label htmlFor="templateId">Template ID</Label>
        <Input
          id="templateId"
          value={(data.templateId as string) || ''}
          onChange={(e) => onUpdate({ templateId: e.target.value })}
          placeholder="Select or enter template ID"
        />
      </div>
      <div>
        <Label htmlFor="fromEmail">From Email (optional)</Label>
        <Input
          id="fromEmail"
          value={(data.fromEmail as string) || ''}
          onChange={(e) => onUpdate({ fromEmail: e.target.value })}
          placeholder="sender@example.com"
        />
      </div>
      <div>
        <Label htmlFor="fromName">From Name (optional)</Label>
        <Input
          id="fromName"
          value={(data.fromName as string) || ''}
          onChange={(e) => onUpdate({ fromName: e.target.value })}
          placeholder="Sender Name"
        />
      </div>
    </>
  );
}

function ConditionConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  const conditions = (data.conditions as any) || { operator: 'and', conditions: [] };

  return (
    <>
      <div>
        <Label>Match</Label>
        <Select
          value={conditions.operator || 'and'}
          onValueChange={(value) =>
            onUpdate({ conditions: { ...conditions, operator: value } })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">All conditions (AND)</SelectItem>
            <SelectItem value="or">Any condition (OR)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm text-muted-foreground">
        Configure conditions to split the flow based on profile properties.
        Matching profiles will go to "Yes" branch, others to "No".
      </div>
    </>
  );
}

function SplitConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  const variants = (data.variants as any[]) || [
    { id: 'A', percentage: 50 },
    { id: 'B', percentage: 50 },
  ];

  const updateVariant = (index: number, percentage: number) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], percentage };
    onUpdate({ variants: newVariants });
  };

  return (
    <>
      <div>
        <Label>Split Type</Label>
        <Select
          value={(data.splitType as string) || 'percentage'}
          onValueChange={(value) => onUpdate({ splitType: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">Percentage</SelectItem>
            <SelectItem value="random">Random</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {variants.map((variant, index) => (
        <div key={variant.id}>
          <Label>Variant {variant.id} (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={variant.percentage}
            onChange={(e) => updateVariant(index, parseInt(e.target.value) || 0)}
          />
        </div>
      ))}
    </>
  );
}

function TagConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  return (
    <div>
      <Label htmlFor="tag">Tag</Label>
      <Input
        id="tag"
        value={(data.tag as string) || ''}
        onChange={(e) => onUpdate({ tag: e.target.value })}
        placeholder="e.g., vip_customer"
      />
    </div>
  );
}

function WebhookConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div>
        <Label htmlFor="url">Webhook URL</Label>
        <Input
          id="url"
          value={(data.url as string) || ''}
          onChange={(e) => onUpdate({ url: e.target.value })}
          placeholder="https://example.com/webhook"
        />
      </div>
      <div>
        <Label>Method</Label>
        <Select
          value={(data.method as string) || 'POST'}
          onValueChange={(value) => onUpdate({ method: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function UpdateProfileConfig({
  data,
  onUpdate,
}: {
  data: Record<string, unknown>;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="text-sm text-muted-foreground">
      Configure profile property updates. Each update will set a specific
      property value on the profile when they reach this node.
    </div>
  );
}
