'use client';

import { useCallback, useState, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import DelayNode from './nodes/DelayNode';
import EmailNode from './nodes/EmailNode';
import ConditionNode from './nodes/ConditionNode';
import SplitNode from './nodes/SplitNode';
import ActionNode from './nodes/ActionNode';
import { NodeToolbar } from './NodeToolbar';
import { NodeConfigPanel } from './NodeConfigPanel';

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  delay: DelayNode,
  email: EmailNode,
  condition: ConditionNode,
  split: SplitNode,
  update_profile: ActionNode,
  add_tag: ActionNode,
  remove_tag: ActionNode,
  webhook: ActionNode,
  exit: ActionNode,
};

interface FlowBuilderProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onChange?: (nodes: Node[], edges: Edge[]) => void;
  readOnly?: boolean;
}

export function FlowBuilder({
  initialNodes = [],
  initialEdges = [],
  onChange,
  readOnly = false,
}: FlowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdges = addEdge(
        {
          ...connection,
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        },
        edges
      );
      setEdges(newEdges);
      onChange?.(nodes, newEdges);
    },
    [edges, nodes, onChange, setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onAddNode = useCallback(
    (type: string) => {
      const newNode: Node = {
        id: `node_${Date.now()}`,
        type,
        position: { x: 250, y: nodes.length * 150 + 50 },
        data: getDefaultNodeData(type),
      };
      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      onChange?.(newNodes, edges);
      setSelectedNode(newNode);
    },
    [nodes, edges, onChange, setNodes]
  );

  const onUpdateNode = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      const newNodes = nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      );
      setNodes(newNodes);
      onChange?.(newNodes, edges);
      setSelectedNode((prev) =>
        prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev
      );
    },
    [nodes, edges, onChange, setNodes]
  );

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      const newNodes = nodes.filter((node) => node.id !== nodeId);
      const newEdges = edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      );
      setNodes(newNodes);
      setEdges(newEdges);
      onChange?.(newNodes, newEdges);
      setSelectedNode(null);
    },
    [nodes, edges, onChange, setNodes, setEdges]
  );

  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      // Trigger onChange after position changes complete
      const positionChanges = changes.filter(
        (c: any) => c.type === 'position' && c.dragging === false
      );
      if (positionChanges.length > 0) {
        setTimeout(() => {
          onChange?.(nodes, edges);
        }, 0);
      }
    },
    [onNodesChange, onChange, nodes, edges]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      onChange?.(nodes, edges);
    },
    [onEdgesChange, onChange, nodes, edges]
  );

  return (
    <div className="h-full w-full flex">
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
        >
          <Background color="#e5e7eb" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case 'trigger':
                  return '#22c55e';
                case 'delay':
                  return '#f97316';
                case 'email':
                  return '#3b82f6';
                case 'condition':
                  return '#a855f7';
                case 'split':
                  return '#ec4899';
                default:
                  return '#6b7280';
              }
            }}
          />
          {!readOnly && (
            <Panel position="top-left">
              <NodeToolbar onAddNode={onAddNode} />
            </Panel>
          )}
        </ReactFlow>
      </div>
      {selectedNode && !readOnly && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={(data) => onUpdateNode(selectedNode.id, data)}
          onDelete={() => onDeleteNode(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

function getDefaultNodeData(type: string): Record<string, unknown> {
  switch (type) {
    case 'trigger':
      return { label: 'Trigger', triggerType: 'event', eventName: '' };
    case 'delay':
      return { label: 'Delay', amount: 1, unit: 'hours' };
    case 'email':
      return { label: 'Send Email', subject: '', templateId: '' };
    case 'condition':
      return {
        label: 'Condition',
        conditions: { operator: 'and', conditions: [] },
      };
    case 'split':
      return {
        label: 'A/B Split',
        splitType: 'percentage',
        variants: [
          { id: 'A', percentage: 50 },
          { id: 'B', percentage: 50 },
        ],
      };
    case 'update_profile':
      return { label: 'Update Profile', actionType: 'update_profile', updates: [] };
    case 'add_tag':
      return { label: 'Add Tag', actionType: 'add_tag', tag: '' };
    case 'remove_tag':
      return { label: 'Remove Tag', actionType: 'remove_tag', tag: '' };
    case 'webhook':
      return { label: 'Webhook', actionType: 'webhook', url: '', method: 'POST' };
    case 'exit':
      return { label: 'Exit Flow', actionType: 'exit' };
    default:
      return { label: type };
  }
}

export default FlowBuilder;
