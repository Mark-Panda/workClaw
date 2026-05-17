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
  it('branch blocks do NOT have type field set (relies on FlowGram addInlineBlocks)', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'fork', type: 'fork', config: {} },
        { id: 'b1', type: 'log', config: {} },
        { id: 'b2', type: 'log', config: {} },
        { id: 'join', type: 'join', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'fork' },
        { from: 'fork', to: 'b1' },
        { from: 'fork', to: 'b2' },
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'join' },
        { from: 'join', to: 'end' },
      ],
      interceptors: [],
    };

    const doc = dslToFlowDocument(dsl);
    const forkNode = doc.nodes.find((n) => n.id === 'fork')!;
    expect(forkNode.type).toBe('dynamicSplit');
    expect(forkNode.blocks).toHaveLength(2);

    for (const block of forkNode.blocks!) {
      // type must be absent so FlowGram calls addInlineBlocks instead of addBlocksAsChildren
      expect(block.type).toBeUndefined();
      // The block must carry __isBranch flag for flowDocumentToDsl to skip it
      expect(block.data).toMatchObject({ __isBranch: true });
    }
  });

  it('staticSplit blocks also omit type', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'if1', type: 'if', config: {} },
        { id: 't', type: 'log', config: {} },
        { id: 'f', type: 'log', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'if1' },
        { from: 'if1', to: 't' },
        { from: 'if1', to: 'f' },
        { from: 't', to: 'end' },
        { from: 'f', to: 'end' },
      ],
      interceptors: [],
    };

    const doc = dslToFlowDocument(dsl);
    const ifNode = doc.nodes.find((n) => n.id === 'if1')!;
    expect(ifNode.type).toBe('staticSplit');
    for (const block of ifNode.blocks!) {
      expect(block.type).toBeUndefined();
      expect(block.data).toMatchObject({ __isBranch: true });
    }
  });

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

  it('loop config enrichment sets correct body_start_id', () => {
    // A loop with notification as body child and subchain as flow child.
    // body_start_id should point to notification (the branch child),
    // NOT to subchain (the consecutive flow sibling).
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
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const loopNode = result.nodes.find((n) => n.id === 'loop')!;
    expect(loopNode.config.body_start_id).toBe('notification');
    expect(loopNode.config.flow_out_id).toBe('end');
  });

  it('switch with case branches survives dsl→doc→dsl', () => {
    const input: RuleChainDsl = {
      chain_id: 'switch-test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'switch', type: 'switch', config: {} },
        { id: 'case1', type: 'case', config: { condition: 'status == \"ok\"' } },
        { id: 'action1', type: 'log_node', config: {} },
        { id: 'case2', type: 'case', config: { condition: 'status == \"error\"' } },
        { id: 'action2', type: 'notification', config: {} },
        { id: 'join', type: 'join', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'switch' },
        { from: 'switch', to: 'case1' },
        { from: 'case1', to: 'action1' },
        { from: 'action1', to: 'join' },
        { from: 'switch', to: 'case2' },
        { from: 'case2', to: 'action2' },
        { from: 'action2', to: 'join' },
        { from: 'join', to: 'end' },
      ],
      interceptors: [],
    };

    const doc = dslToFlowDocument(input);
    // Switch should be a dynamicSplit with 2 branch blocks
    const switchNode = doc.nodes.find((n) => n.id === 'switch')!;
    expect(switchNode.type).toBe('dynamicSplit');
    expect(switchNode.blocks).toHaveLength(2);

    // Each block should contain a case + action
    for (const block of switchNode.blocks ?? []) {
      expect(block.data).toMatchObject({ __isBranch: true });
      expect(block.blocks).toHaveLength(2); // case + action
    }

    // Round-trip back to DSL
    const output = flowDocumentToDsl(doc, input.chain_id, input.version);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
  });

  it('if/try_catch static split survives dsl→doc→dsl', () => {
    const input: RuleChainDsl = {
      chain_id: 'if-test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'if1', type: 'if', config: { expression: '1 == 1' } },
        { id: 'true_action', type: 'log_node', config: {} },
        { id: 'false_action', type: 'notification', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'if1' },
        { from: 'if1', to: 'true_action' },
        { from: 'if1', to: 'false_action' },
        { from: 'true_action', to: 'end' },
        { from: 'false_action', to: 'end' },
      ],
      interceptors: [],
    };

    const doc = dslToFlowDocument(input);
    const ifNode = doc.nodes.find((n) => n.id === 'if1')!;
    expect(ifNode.type).toBe('staticSplit');
    expect(ifNode.blocks).toHaveLength(2);

    // First block is True branch
    const trueBlock = ifNode.blocks![0];
    expect(trueBlock.data).toMatchObject({ __isBranch: true, ruleNodeType: 'if_block', title: 'True' });
    expect(trueBlock.blocks![0].id).toBe('true_action');

    // Second block is False branch
    const falseBlock = ifNode.blocks![1];
    expect(falseBlock.data).toMatchObject({ __isBranch: true, ruleNodeType: 'if_block', title: 'False' });
    expect(falseBlock.blocks![0].id).toBe('false_action');

    // Round-trip back to DSL
    const output = flowDocumentToDsl(doc, input.chain_id, input.version);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
  });

  it('try_catch with try/catch blocks survives dsl→doc→dsl', () => {
    const input: RuleChainDsl = {
      chain_id: 'tc-test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'tc', type: 'try_catch', config: {} },
        { id: 'try_action', type: 'script', config: {} },
        { id: 'catch_action', type: 'log_node', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'tc' },
        { from: 'tc', to: 'try_action' },
        { from: 'tc', to: 'catch_action' },
        { from: 'try_action', to: 'end' },
        { from: 'catch_action', to: 'end' },
      ],
      interceptors: [],
    };

    const doc = dslToFlowDocument(input);
    const tcNode = doc.nodes.find((n) => n.id === 'tc')!;
    expect(tcNode.type).toBe('staticSplit');
    expect(tcNode.blocks).toHaveLength(2);

    // First block is Try
    const tryBlock = tcNode.blocks![0];
    expect(tryBlock.data).toMatchObject({ __isBranch: true, title: 'Try' });
    expect(tryBlock.blocks![0].id).toBe('try_action');

    // Second block is Catch
    const catchBlock = tcNode.blocks![1];
    expect(catchBlock.data).toMatchObject({ __isBranch: true, title: 'Catch' });
    expect(catchBlock.blocks![0].id).toBe('catch_action');

    // Round-trip back to DSL
    const output = flowDocumentToDsl(doc, input.chain_id, input.version);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
  });

  it('fork with branches survives dsl→doc→dsl', () => {
    const input: RuleChainDsl = {
      chain_id: 'fork-test',
      version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'fork', type: 'fork', config: { join_at: 'join' } },
        { id: 'branch1', type: 'delay', config: { duration_ms: 100 } },
        { id: 'branch2', type: 'log_node', config: {} },
        { id: 'join', type: 'join', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'fork' },
        { from: 'fork', to: 'branch1' },
        { from: 'fork', to: 'branch2' },
        { from: 'branch1', to: 'join' },
        { from: 'branch2', to: 'join' },
        { from: 'join', to: 'end' },
      ],
      interceptors: [],
    };

    const doc = dslToFlowDocument(input);
    const forkNode = doc.nodes.find((n) => n.id === 'fork')!;
    expect(forkNode.type).toBe('dynamicSplit');
    expect(forkNode.blocks).toHaveLength(2);

    // Round-trip back to DSL
    const output = flowDocumentToDsl(doc, input.chain_id, input.version);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
  });

  it('switch config enrichment generates segments', () => {
    // Switch with 2 case branches, the enrichment should set segments config
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'switch',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'switch', title: 'Switch', config: {} },
        blocks: [
          {
            id: 'switch_branch_0',
            type: 'block',
            data: { ruleNodeType: '__branch__', title: 'Case 1', config: {}, __isBranch: true },
            blocks: [makeNode('case1', 'case', { condition: 'a==1' }), makeNode('action1', 'delay')],
          },
          {
            id: 'switch_branch_1',
            type: 'block',
            data: { ruleNodeType: '__branch__', title: 'Default', config: {}, __isBranch: true },
            blocks: [makeNode('case2', 'case', { condition: '' })],
          },
        ],
      } as FlowNodeJSON,
      makeNode('join', 'join'),
      makeNode('end', 'end'),
    ];

    // Need edges to define the flow past branches for conversion
    const edges = [
      { from: 'switch', to: 'case1' },
      { from: 'switch', to: 'case2' },
      { from: 'case1', to: 'action1' },
      { from: 'action1', to: 'join' },
      { from: 'case2', to: 'join' },
      { from: 'join', to: 'end' },
    ];

    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const switchNode = result.nodes.find((n) => n.id === 'switch')!;
    expect(switchNode.type).toBe('switch');
    expect(switchNode.config.segments).toBeDefined();
    expect(Array.isArray(switchNode.config.segments)).toBe(true);
  });
});
