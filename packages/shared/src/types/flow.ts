export type FlowStatus = 'draft' | 'active' | 'paused' | 'archived';

export type FlowTriggerType =
  | 'event'
  | 'segment_entry'
  | 'segment_exit'
  | 'date_property'
  | 'manual';

export interface FlowTrigger {
  type: FlowTriggerType;
  eventName?: string;
  segmentId?: string;
  dateProperty?: string;
  dateOffset?: {
    value: number;
    unit: 'hours' | 'days' | 'weeks';
    before: boolean;
  };
  filters?: import('./segment').ConditionGroup;
}

export type FlowNodeType =
  | 'trigger'
  | 'email'
  | 'delay'
  | 'condition'
  | 'split'
  | 'update_profile'
  | 'webhook';

export interface FlowNodeBase {
  id: string;
  type: FlowNodeType;
  name: string;
  position: { x: number; y: number };
}

export interface TriggerNode extends FlowNodeBase {
  type: 'trigger';
  trigger: FlowTrigger;
}

export interface EmailNode extends FlowNodeBase {
  type: 'email';
  subject: string;
  previewText?: string;
  templateId?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface DelayNode extends FlowNodeBase {
  type: 'delay';
  delayValue: number;
  delayUnit: 'minutes' | 'hours' | 'days' | 'weeks';
  delayUntil?: {
    time: string;
    timezone?: string;
  };
}

export interface ConditionNode extends FlowNodeBase {
  type: 'condition';
  conditions: import('./segment').ConditionGroup;
}

export interface SplitNode extends FlowNodeBase {
  type: 'split';
  splitType: 'random' | 'conditional';
  branches: {
    id: string;
    name: string;
    weight?: number;
    conditions?: import('./segment').ConditionGroup;
  }[];
}

export interface UpdateProfileNode extends FlowNodeBase {
  type: 'update_profile';
  updates: {
    field: string;
    value: unknown;
  }[];
}

export interface WebhookNode extends FlowNodeBase {
  type: 'webhook';
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export type FlowNode =
  | TriggerNode
  | EmailNode
  | DelayNode
  | ConditionNode
  | SplitNode
  | UpdateProfileNode
  | WebhookNode;

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

export interface Flow {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: FlowStatus;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings: {
    exitOnConversion?: boolean;
    conversionEvent?: string;
    goalEvent?: string;
    maxEnrollments?: number;
    enrollmentWindow?: {
      value: number;
      unit: 'hours' | 'days' | 'weeks';
    };
  };
  stats?: {
    totalEnrolled: number;
    activelyInFlow: number;
    completed: number;
    converted: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFlowInput {
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings?: Flow['settings'];
}

export interface UpdateFlowInput {
  name?: string;
  description?: string;
  status?: FlowStatus;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  settings?: Flow['settings'];
}

export type FlowEnrollmentStatus = 'active' | 'completed' | 'exited' | 'failed';

export interface FlowEnrollment {
  id: string;
  flowId: string;
  profileId: string;
  currentNodeId: string;
  status: FlowEnrollmentStatus;
  enteredAt: Date;
  exitedAt?: Date;
  exitReason?: string;
  metadata: Record<string, unknown>;
}
