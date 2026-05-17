import { describe, it, expect } from 'vitest';
import type { FlowNodeJSON } from '@flowgram.ai/fixed-layout-editor';
import type { RuleChainDsl } from '../../../types/rule';
import { dslToFlowDocument, flowDocumentToDsl } from './converter';

// Helper: create a FlowNodeJSON for testing
function makeNode(id: string, type: string, data?: Record<string, unknown>, blocks?: FlowNodeJSON[]): FlowNodeJSON {
  return {
    id,
    type,
    data: { ruleNodeType: type, title: type, config: {}, ...(data ?? {}) },
    ...(blocks ? { blocks } : {}),
  } as FlowNodeJSON;
}

function makeBodyBlock(id: string, children: FlowNodeJSON[]): FlowNodeJSON {
  return {
    id,
    type: 'block',
    data: { ruleNodeType: '__body__', title: 'Body', config: {}, __isBranch: true },
    blocks: children,
  } as FlowNodeJSON;
}

// ─── dslToFlowDocument tests ────────────────────────────────────

describe('dslToFlowDocument', () => {
  it('converts a simple linear chain', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [{ from: 'start', to: 'end' }],
      interceptors: [],
    };
    const result = dslToFlowDocument(dsl);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe('start');
    expect(result.nodes[1].id).toBe('end');
  });

  it('loop with body child and flow child', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'loop', type: 'loop', config: {} },
        { id: 'notification', type: 'notification', config: {} },
        { id: 'subchain', type: 'subchain', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'loop' },
        { from: 'loop', to: 'subchain' },
        { from: 'loop', to: 'notification' },
        { from: 'subchain', to: 'end' },
      ],
      interceptors: [],
    };
    const result = dslToFlowDocument(dsl);

    const rootIds = result.nodes.map((n) => n.id);
    expect(rootIds).toEqual(['start', 'loop', 'subchain', 'end']);

    const loopNode = result.nodes.find((n) => n.id === 'loop')!;
    expect(loopNode.blocks).toHaveLength(1);
    const bodyBlock = loopNode.blocks![0];
    expect(bodyBlock.data).toMatchObject({ __isBranch: true, ruleNodeType: '__body__' });
    const bodyNodeIds = (bodyBlock.blocks ?? []).map((n) => n.id);
    expect(bodyNodeIds).toEqual(['notification']);
  });

  it('handles nodes in arbitrary DSL array order (topological sort)', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'loop', type: 'loop', config: {} },
        { id: 'end', type: 'end', config: {} },
        { id: 'notification', type: 'notification', config: {} },
        { id: 'subchain', type: 'subchain', config: {} },
      ],
      edges: [
        { from: 'start', to: 'loop' },
        { from: 'loop', to: 'subchain' },
        { from: 'loop', to: 'notification' },
        { from: 'subchain', to: 'end' },
      ],
      interceptors: [],
    };
    const result = dslToFlowDocument(dsl);

    const rootIds = result.nodes.map((n) => n.id);
    expect(rootIds[0]).toBe('start');
    expect(rootIds[1]).toBe('loop');
    const subchainIdx = rootIds.indexOf('subchain');
    const endIdx = rootIds.indexOf('end');
    expect(subchainIdx).toBeLessThan(endIdx);
  });
});

// ─── flowDocumentToDsl tests ────────────────────────────────────

describe('flowDocumentToDsl', () => {
  it('generates edges for root-level siblings in correct order', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('loop', 'loop', undefined, [
        makeBodyBlock('loop__body', [
          makeNode('notification', 'notification'),
        ]),
      ]),
      makeNode('subchain', 'subchain'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes });

    expect(result.edges).toContainEqual({ from: 'start', to: 'loop' });
    expect(result.edges).toContainEqual({ from: 'loop', to: 'subchain' });
    expect(result.edges).toContainEqual({ from: 'subchain', to: 'end' });
    expect(result.edges).toContainEqual({ from: 'loop', to: 'notification' });
    // end must have no outgoing edges
    expect(result.edges.filter((e) => e.from === 'end')).toHaveLength(0);
  });

  it('end has no outgoing edges even when nodes follow it', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('end', 'end'),
      makeNode('extra', 'extra'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes });

    expect(result.edges).toContainEqual({ from: 'start', to: 'end' });
    expect(result.edges).not.toContainEqual({ from: 'end', to: 'extra' });
  });

  it('topological reorder fixes FlowGram reordering', () => {
    // Simulate FlowGram reordering: [start, loop, end, subchain]
    // The correct order should be: [start, loop, subchain, end]
    const reorderedNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('loop', 'loop', undefined, [
        makeBodyBlock('loop__body', [
          makeNode('notification', 'notification'),
        ]),
      ]),
      makeNode('end', 'end'),
      makeNode('subchain', 'subchain'),
    ];

    // Simulate the topological reorder (as done in notifyChange)
    const edges: RuleChainDsl['edges'] = [
      { from: 'start', to: 'loop' },
      { from: 'loop', to: 'subchain' },
      { from: 'loop', to: 'notification' },
      { from: 'subchain', to: 'end' },
    ];

    // Manual reorder using the same algorithm as reorderByTopology
    const adj = new Map<string, string[]>();
    const rev = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.to);
      if (!rev.has(e.to)) rev.set(e.to, []);
      rev.get(e.to)!.push(e.from);
    }

    const nodeMap = new Map(reorderedNodes.map((n) => [n.id, n]));
    const nodeIds = new Set(reorderedNodes.map((n) => n.id));
    const visited = new Set<string>();
    const sorted: FlowNodeJSON[] = [];

    function dfs(id: string): void {
      if (visited.has(id) || !nodeIds.has(id)) return;
      visited.add(id);
      const n = nodeMap.get(id);
      if (n) sorted.push(n);
      for (const next of adj.get(id) ?? []) dfs(next);
    }

    for (const n of reorderedNodes) if (!rev.has(n.id)) dfs(n.id);
    for (const n of reorderedNodes) if (!visited.has(n.id)) sorted.push(n);

    // Merge with original order for unknown nodes
    const sortedIds = new Set(sorted.map((n) => n.id));
    const merged: FlowNodeJSON[] = [];
    let si = 0;
    for (const n of reorderedNodes) {
      if (sortedIds.has(n.id)) {
        const idx = sorted.findIndex((s, i) => i >= si && s.id === n.id);
        if (idx >= 0) {
          for (; si < idx; si++) merged.push(sorted[si]);
          if (si < sorted.length && sorted[si].id === n.id) {
            merged.push(sorted[si]);
            si++;
          }
        }
      } else {
        merged.push(n);
      }
    }
    for (; si < sorted.length; si++) merged.push(sorted[si]);

    const result = flowDocumentToDsl({ nodes: merged });

    // After topological reorder, edges should be correct
    expect(result.edges).toContainEqual({ from: 'start', to: 'loop' });
    expect(result.edges).toContainEqual({ from: 'loop', to: 'subchain' });
    expect(result.edges).toContainEqual({ from: 'subchain', to: 'end' });
    expect(result.edges).toContainEqual({ from: 'loop', to: 'notification' });
    expect(result.edges.filter((e) => e.from === 'end')).toHaveLength(0);
  });
});

// ─── Round-trip test ────────────────────────────────────────────

describe('round-trip', () => {
  it('loop with body and flow child survives dsl→doc→dsl', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'loop', type: 'loop', config: {} },
        { id: 'notification', type: 'notification', config: {} },
        { id: 'subchain', type: 'subchain', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'loop' },
        { from: 'loop', to: 'subchain' },
        { from: 'loop', to: 'notification' },
        { from: 'subchain', to: 'end' },
      ],
      interceptors: [],
    };

    const doc = dslToFlowDocument(input);
    const output = flowDocumentToDsl(doc, input.chain_id, input.version);

    // All input edges should be preserved
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }

    // end must have no outgoing edges
    expect(output.edges.filter((e) => e.from === 'end')).toHaveLength(0);
  });
});
