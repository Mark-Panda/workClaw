import { describe, it, expect } from 'vitest';
import type { FlowNodeJSON } from '@flowgram.ai/fixed-layout-editor';
import type { RuleChainDsl } from '../../../types/rule';
import { dslToFlowDocument, flowDocumentToDsl } from './converter';

// ─── Helpers ────────────────────────────────────────────────────

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

function makeBranchBlock(id: string, ruleNodeType: string, title: string, config: Record<string, unknown>, children: FlowNodeJSON[]): FlowNodeJSON {
  return {
    id,
    data: { ruleNodeType, title, config, __isBranch: true },
    blocks: children.length > 0 ? children : undefined,
  } as FlowNodeJSON;
}

/** Quick round-trip: DSL → doc → DSL */
function roundTrip(dsl: RuleChainDsl): RuleChainDsl {
  const doc = dslToFlowDocument(dsl);
  return flowDocumentToDsl(doc, dsl.chain_id, dsl.version);
}

// ═══════════════════════════════════════════════════════════════════
// 1. DSL → FlowDocument conversion tests
// ═══════════════════════════════════════════════════════════════════

describe('dslToFlowDocument', () => {
  it('converts a simple linear chain', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
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

  it('converts fork with branches to dynamicSplit', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'fork', type: 'fork', config: {} },
        { id: 'b1', type: 'log', config: {} },
        { id: 'b2', type: 'delay', config: {} },
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
      expect(block.type).toBeUndefined(); // Must NOT have type
      expect(block.data).toMatchObject({ __isBranch: true });
    }
  });

  it('converts if to staticSplit', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'if1', type: 'if', config: { expression: 'x > 0' } },
        { id: 't', type: 'log', config: {} },
        { id: 'f', type: 'delay', config: {} },
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
    expect(ifNode.blocks).toHaveLength(2);
    // First block = True, second = False
    expect(ifNode.blocks![0].data).toMatchObject({ ruleNodeType: 'if_block', title: 'True' });
    expect(ifNode.blocks![1].data).toMatchObject({ ruleNodeType: 'if_block', title: 'False' });
  });

  it('converts try_catch to staticSplit', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'tc', type: 'try_catch', config: {} },
        { id: 'try_act', type: 'script', config: {} },
        { id: 'catch_act', type: 'log', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'tc' },
        { from: 'tc', to: 'try_act' },
        { from: 'tc', to: 'catch_act' },
        { from: 'try_act', to: 'end' },
        { from: 'catch_act', to: 'end' },
      ],
      interceptors: [],
    };
    const doc = dslToFlowDocument(dsl);
    const tcNode = doc.nodes.find((n) => n.id === 'tc')!;
    expect(tcNode.type).toBe('staticSplit');
    expect(tcNode.blocks).toHaveLength(2);
    expect(tcNode.blocks![0].data).toMatchObject({ ruleNodeType: 'try_block', title: 'Try' });
    expect(tcNode.blocks![1].data).toMatchObject({ ruleNodeType: 'catch_block', title: 'Catch' });
  });

  it('converts loop with body child', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
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
    const loopNode = result.nodes.find((n) => n.id === 'loop')!;
    expect(loopNode.blocks).toHaveLength(1);
    expect(loopNode.blocks![0].data).toMatchObject({ ruleNodeType: '__body__' });
  });

  it('converts switch with new inline branches format', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'switch', type: 'switch', config: {
          join_at: 'join',
          branches: [
            { condition: 'x == 1', start_id: 'act1', end_id: 'join' },
            { condition: '', start_id: 'act2', end_id: 'join' },
          ],
        }},
        { id: 'act1', type: 'log', config: {} },
        { id: 'act2', type: 'delay', config: {} },
        { id: 'join', type: 'join', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'switch' },
        { from: 'switch', to: 'act1' },
        { from: 'switch', to: 'act2' },
        { from: 'act1', to: 'join' },
        { from: 'act2', to: 'join' },
        { from: 'join', to: 'end' },
      ],
      interceptors: [],
    };
    const doc = dslToFlowDocument(dsl);
    const switchNode = doc.nodes.find((n) => n.id === 'switch')!;
    expect(switchNode.type).toBe('dynamicSplit');
    expect(switchNode.blocks).toHaveLength(2);
    // First branch should carry the condition from config
    expect((switchNode.blocks![0].data as any).config.condition).toBe('x == 1');
  });

  it('handles legacy switch format with case nodes in DSL', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'switch', type: 'switch', config: {} },
        { id: 'case1', type: 'case', config: { condition: 'x == 1' } },
        { id: 'action1', type: 'log', config: {} },
        { id: 'case2', type: 'case', config: { condition: '' } },
        { id: 'action2', type: 'delay', config: {} },
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
    const doc = dslToFlowDocument(dsl);
    const switchNode = doc.nodes.find((n) => n.id === 'switch')!;
    expect(switchNode.type).toBe('dynamicSplit');
    expect(switchNode.blocks).toHaveLength(2);
    // Condition should be extracted from the case node
    expect((switchNode.blocks![0].data as any).config.condition).toBe('x == 1');
  });

  it('handles topological sorting for disordered nodes', () => {
    const dsl: RuleChainDsl = {
      chain_id: 'test', version: '1.0',
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

// ═══════════════════════════════════════════════════════════════════
// 2. FlowDocument → DSL conversion tests
// ═══════════════════════════════════════════════════════════════════

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
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    expect(result.edges).toContainEqual({ from: 'start', to: 'loop' });
    expect(result.edges).toContainEqual({ from: 'loop', to: 'subchain' });
    expect(result.edges).toContainEqual({ from: 'subchain', to: 'end' });
    expect(result.edges).toContainEqual({ from: 'loop', to: 'notification' });
    expect(result.edges.filter((e) => e.from === 'end')).toHaveLength(0);
  });

  it('end node has no outgoing edges', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('end', 'end'),
      makeNode('extra', 'extra'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes });
    expect(result.edges).toContainEqual({ from: 'start', to: 'end' });
    expect(result.edges).not.toContainEqual({ from: 'end', to: 'extra' });
  });

  it('switch branches produce branches config with conditions', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'switch',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'switch', title: 'Switch', config: { join_at: 'join' } },
        blocks: [
          makeBranchBlock('sw_b0', 'case', 'Case 1', { condition: 'x > 0' }, [makeNode('act1', 'log')]),
          makeBranchBlock('sw_b1', 'case_default', '默认', {}, [makeNode('act2', 'delay')]),
        ],
      } as FlowNodeJSON,
      makeNode('join', 'join'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const switchNode = result.nodes.find((n) => n.id === 'switch')!;
    expect(switchNode.type).toBe('switch');
    expect(Array.isArray(switchNode.config.branches)).toBe(true);

    const branches = switchNode.config.branches as Array<{ condition: string; start_id: string }>;
    expect(branches.length).toBe(2);
    expect(branches[0].condition).toBe('x > 0');
    expect(branches[0].start_id).toBe('act1');
    expect(branches[1].condition).toBe('');
    expect(branches[1].start_id).toBe('act2');

    // case/case_default should NOT appear as DSL nodes
    const caseNodes = result.nodes.filter((n) => n.type === 'case' || n.type === 'case_default');
    expect(caseNodes).toHaveLength(0);
  });

  it('if_block markers are not emitted as DSL nodes', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'if1',
        type: 'staticSplit',
        data: { ruleNodeType: 'if', title: 'If', config: { expression: '1 == 1' } },
        blocks: [
          makeBranchBlock('if1_true', 'if_block', 'True', {}, [makeNode('t_act', 'log')]),
          makeBranchBlock('if1_false', 'if_block', 'False', {}, [makeNode('f_act', 'delay')]),
        ],
      } as FlowNodeJSON,
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const ifBlockNodes = result.nodes.filter((n) => n.type === 'if_block');
    expect(ifBlockNodes).toHaveLength(0);
  });

  it('try_block/catch_block markers are not emitted as DSL nodes', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'tc',
        type: 'staticSplit',
        data: { ruleNodeType: 'try_catch', title: 'TryCatch', config: {} },
        blocks: [
          makeBranchBlock('tc_try', 'try_block', 'Try', {}, [makeNode('try_act', 'script')]),
          makeBranchBlock('tc_catch', 'catch_block', 'Catch', {}, [makeNode('catch_act', 'log')]),
        ],
      } as FlowNodeJSON,
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const blockNodes = result.nodes.filter((n) => n.type === 'try_block' || n.type === 'catch_block');
    expect(blockNodes).toHaveLength(0);
  });

  it('loop config enrichment sets body_start_id and flow_out_id', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('loop', 'loop', undefined, [
        makeBodyBlock('loop__body', [makeNode('notification', 'notification')]),
      ]),
      makeNode('subchain', 'subchain'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const loopNode = result.nodes.find((n) => n.id === 'loop')!;
    expect(loopNode.config.body_start_id).toBe('notification');
    expect(loopNode.config.flow_out_id).toBe('end');
  });

  it('condition node in linear chain has no branch config (branches inferred from edges)', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('cond', 'condition', { config: { expression: '1 == 1' } }),
      makeNode('true_act', 'log'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const condNode = result.nodes.find((n) => n.id === 'cond')!;
    // In linear mode (not a staticSplit), condition just has one outgoing edge
    expect(condNode.config.expression).toBe('1 == 1');
    expect(result.edges).toContainEqual({ from: 'cond', to: 'true_act' });
  });

  it('if node in linear chain has no branch config (branches inferred from edges)', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('if1', 'if', { config: { expression: 'x > 0' } }),
      makeNode('true_act', 'log'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const ifNode = result.nodes.find((n) => n.id === 'if1')!;
    expect(ifNode.config.expression).toBe('x > 0');
    expect(result.edges).toContainEqual({ from: 'if1', to: 'true_act' });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Round-trip tests (DSL → doc → DSL)
// ═══════════════════════════════════════════════════════════════════

describe('round-trip', () => {
  it('simple linear chain preserves edges', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'log1', type: 'log', config: { level: 'info', message: 'hello' } },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [{ from: 'start', to: 'log1' }, { from: 'log1', to: 'end' }],
      interceptors: [],
    };
    const output = roundTrip(input);
    expect(output.edges).toContainEqual({ from: 'start', to: 'log1' });
    expect(output.edges).toContainEqual({ from: 'log1', to: 'end' });
    expect(output.edges.filter((e) => e.from === 'end')).toHaveLength(0);
  });

  it('loop with body and flow child survives round-trip', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt', version: '1.0',
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
    const output = roundTrip(input);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
  });

  it('fork with branches survives round-trip', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'fork', type: 'fork', config: { join_at: 'join' } },
        { id: 'b1', type: 'delay', config: { duration_ms: 100 } },
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
    const output = roundTrip(input);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
    // Fork should get segments
    const forkNode = output.nodes.find((n) => n.id === 'fork')!;
    expect(Array.isArray(forkNode.config.segments)).toBe(true);
  });

  it('switch with inline branches survives round-trip', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'switch', type: 'switch', config: {
          join_at: 'join',
          branches: [
            { condition: 'status == "ok"', start_id: 'act1', end_id: 'join' },
            { condition: '', start_id: 'act2', end_id: 'join' },
          ],
        }},
        { id: 'act1', type: 'log', config: {} },
        { id: 'act2', type: 'notification', config: {} },
        { id: 'join', type: 'join', config: {} },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [
        { from: 'start', to: 'switch' },
        { from: 'switch', to: 'act1' },
        { from: 'switch', to: 'act2' },
        { from: 'act1', to: 'join' },
        { from: 'act2', to: 'join' },
        { from: 'join', to: 'end' },
      ],
      interceptors: [],
    };
    const output = roundTrip(input);
    expect(output.edges).toContainEqual({ from: 'start', to: 'switch' });
    expect(output.edges).toContainEqual({ from: 'switch', to: 'act1' });
    expect(output.edges).toContainEqual({ from: 'switch', to: 'act2' });
    expect(output.edges).toContainEqual({ from: 'join', to: 'end' });

    const switchNode = output.nodes.find((n) => n.id === 'switch')!;
    expect(Array.isArray(switchNode.config.branches)).toBe(true);
    const branches = switchNode.config.branches as Array<{ condition: string }>;
    expect(branches[0].condition).toBe('status == "ok"');
    expect(branches[1].condition).toBe('');
  });

  it('if with expression survives round-trip', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'if1', type: 'if', config: { expression: 'x > 0' } },
        { id: 'true_action', type: 'log', config: {} },
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
    const output = roundTrip(input);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
    const ifNode = output.nodes.find((n) => n.id === 'if1')!;
    expect(ifNode.config.expression).toBe('x > 0');
  });

  it('try_catch survives round-trip', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'tc', type: 'try_catch', config: {} },
        { id: 'try_action', type: 'script', config: {} },
        { id: 'catch_action', type: 'log', config: {} },
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
    const output = roundTrip(input);
    for (const e of input.edges) {
      expect(output.edges).toContainEqual(e);
    }
  });

  it('legacy switch format (with case nodes) round-trips to new format', () => {
    const input: RuleChainDsl = {
      chain_id: 'legacy', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'switch', type: 'switch', config: {} },
        { id: 'case1', type: 'case', config: { condition: 'x == 1' } },
        { id: 'action1', type: 'log', config: {} },
        { id: 'case2', type: 'case', config: { condition: '' } },
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
    const output = roundTrip(input);
    // case nodes should be gone — conditions are in switch config.branches
    const caseNodes = output.nodes.filter((n) => n.type === 'case' || n.type === 'case_default');
    expect(caseNodes).toHaveLength(0);

    // switch should have branches
    const switchNode = output.nodes.find((n) => n.id === 'switch')!;
    expect(Array.isArray(switchNode.config.branches)).toBe(true);
    const branches = switchNode.config.branches as Array<{ condition: string; start_id: string }>;
    expect(branches.length).toBe(2);
    expect(branches[0].condition).toBe('x == 1');
  });

  it('condition node round-trips preserving expression', () => {
    const input: RuleChainDsl = {
      chain_id: 'rt', version: '1.0',
      nodes: [
        { id: 'start', type: 'start', config: {} },
        { id: 'cond', type: 'condition', config: { expression: 'contains(msg, "hello")' } },
        { id: 'end', type: 'end', config: {} },
      ],
      edges: [{ from: 'start', to: 'cond' }, { from: 'cond', to: 'end' }],
      interceptors: [],
    };
    const output = roundTrip(input);
    const condNode = output.nodes.find((n) => n.id === 'cond')!;
    expect(condNode.config.expression).toBe('contains(msg, "hello")');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Node type integrity tests
// ═══════════════════════════════════════════════════════════════════

describe('node type integrity', () => {
  it('backend-only types (case, if_block, catch_block) never appear in output DSL', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'switch',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'switch', title: 'Switch', config: { join_at: 'join' } },
        blocks: [
          makeBranchBlock('sw_b0', 'case', 'Case 1', { condition: 'x > 0' }, [makeNode('a1', 'log')]),
          makeBranchBlock('sw_b1', 'case_default', '默认', {}, [makeNode('a2', 'delay')]),
        ],
      } as FlowNodeJSON,
      {
        id: 'if1',
        type: 'staticSplit',
        data: { ruleNodeType: 'if', title: 'If', config: { expression: '1 == 1' } },
        blocks: [
          makeBranchBlock('if1_t', 'if_block', 'True', {}, [makeNode('t1', 'log')]),
          makeBranchBlock('if1_f', 'if_block', 'False', {}, [makeNode('f1', 'delay')]),
        ],
      } as FlowNodeJSON,
      {
        id: 'tc',
        type: 'staticSplit',
        data: { ruleNodeType: 'try_catch', title: 'TC', config: {} },
        blocks: [
          makeBranchBlock('tc_t', 'try_block', 'Try', {}, [makeNode('try1', 'script')]),
          makeBranchBlock('tc_c', 'catch_block', 'Catch', {}, [makeNode('catch1', 'log')]),
        ],
      } as FlowNodeJSON,
      makeNode('join', 'join'),
      makeNode('end', 'end'),
    ];

    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const skippedTypes = ['case', 'case_default', 'if_block', 'try_block', 'catch_block'];
    const found = result.nodes.filter((n) => skippedTypes.includes(n.type));
    expect(found).toHaveLength(0);
  });

  it('all real DSL node types are preserved in output', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('cond', 'condition'),
      makeNode('transform', 'transform'),
      makeNode('assign', 'assign'),
      makeNode('delay', 'delay'),
      makeNode('log', 'log'),
      makeNode('script', 'script'),
      makeNode('rest', 'rest_client'),
      makeNode('notif', 'notification'),
      makeNode('llm', 'llm'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const realTypes = ['start', 'condition', 'transform', 'assign', 'delay', 'log', 'script', 'rest_client', 'notification', 'llm', 'end'];
    for (const t of realTypes) {
      expect(result.nodes.some((n) => n.type === t)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Complex scenario tests
// ═══════════════════════════════════════════════════════════════════

describe('complex scenarios', () => {
  it('nested containers: loop inside fork branch', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'fork',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'fork', title: 'Fork', config: { join_at: 'join' } },
        blocks: [
          makeBranchBlock('fork_b0', '__branch__', 'Branch 1', {}, [
            makeNode('loop', 'loop', undefined, [
              makeBodyBlock('loop__body', [makeNode('log1', 'log')]),
            ]),
          ]),
          makeBranchBlock('fork_b1', '__branch__', 'Branch 2', {}, [makeNode('delay1', 'delay')]),
        ],
      } as FlowNodeJSON,
      makeNode('join', 'join'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    // loop should appear as a real node
    expect(result.nodes.some((n) => n.id === 'loop')).toBe(true);
    // Fork should have segments
    const forkNode = result.nodes.find((n) => n.id === 'fork')!;
    expect(Array.isArray(forkNode.config.segments)).toBe(true);
  });

  it('multiple containers in sequence', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'if1',
        type: 'staticSplit',
        data: { ruleNodeType: 'if', title: 'If', config: { expression: '1 == 1' } },
        blocks: [
          makeBranchBlock('if1_t', 'if_block', 'True', {}, [makeNode('t_act', 'log')]),
          makeBranchBlock('if1_f', 'if_block', 'False', {}, [makeNode('f_act', 'delay')]),
        ],
      } as FlowNodeJSON,
      {
        id: 'switch1',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'switch', title: 'Switch', config: { join_at: 'join1' } },
        blocks: [
          makeBranchBlock('sw_b0', 'case', 'Case 1', { condition: 'x == 1' }, [makeNode('s_act1', 'log')]),
          makeBranchBlock('sw_b1', 'case_default', '默认', {}, [makeNode('s_act2', 'notification')]),
        ],
      } as FlowNodeJSON,
      makeNode('join1', 'join'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    // Both containers should appear
    expect(result.nodes.some((n) => n.id === 'if1')).toBe(true);
    expect(result.nodes.some((n) => n.id === 'switch1')).toBe(true);
    // Branch markers should NOT appear
    const markerTypes = ['if_block', 'case', 'case_default'];
    expect(result.nodes.filter((n) => markerTypes.includes(n.type))).toHaveLength(0);
  });

  it('switch with 3+ branches', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'switch',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'switch', title: 'Switch', config: { join_at: 'join' } },
        blocks: [
          makeBranchBlock('sw_b0', 'case', 'Case 1', { condition: 'x == 1' }, [makeNode('a1', 'log')]),
          makeBranchBlock('sw_b1', 'case', 'Case 2', { condition: 'x == 2' }, [makeNode('a2', 'delay')]),
          makeBranchBlock('sw_b2', 'case', 'Case 3', { condition: 'x == 3' }, [makeNode('a3', 'script')]),
          makeBranchBlock('sw_b3', 'case_default', '默认', {}, [makeNode('a4', 'notification')]),
        ],
      } as FlowNodeJSON,
      makeNode('join', 'join'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    const switchNode = result.nodes.find((n) => n.id === 'switch')!;
    const branches = switchNode.config.branches as Array<{ condition: string }>;
    expect(branches).toHaveLength(4);
    expect(branches[0].condition).toBe('x == 1');
    expect(branches[1].condition).toBe('x == 2');
    expect(branches[2].condition).toBe('x == 3');
    expect(branches[3].condition).toBe('');
  });

  it('empty switch (no branches) still outputs a switch node', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('switch', 'switch', { ruleNodeType: 'switch', title: 'Switch', config: { branches: [] } }),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    expect(result.nodes.some((n) => n.id === 'switch' && n.type === 'switch')).toBe(true);
  });

  it('break_loop node passes through correctly', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      makeNode('loop', 'loop', undefined, [
        makeBodyBlock('loop__body', [
          makeNode('log1', 'log'),
          makeNode('brk', 'break_loop'),
        ]),
      ]),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    expect(result.nodes.some((n) => n.id === 'brk' && n.type === 'break_loop')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Edge correctness tests
// ═══════════════════════════════════════════════════════════════════

describe('edge correctness', () => {
  it('fork branch-tail → join edges are generated', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'fork',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'fork', title: 'Fork', config: { join_at: 'join' } },
        blocks: [
          makeBranchBlock('fork_b0', '__branch__', 'Branch 1', {}, [makeNode('b1_act', 'log')]),
          makeBranchBlock('fork_b1', '__branch__', 'Branch 2', {}, [makeNode('b2_act', 'delay')]),
        ],
      } as FlowNodeJSON,
      makeNode('join', 'join'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    // Each branch last node → join
    expect(result.edges).toContainEqual({ from: 'b1_act', to: 'join' });
    expect(result.edges).toContainEqual({ from: 'b2_act', to: 'join' });
    // join → end
    expect(result.edges).toContainEqual({ from: 'join', to: 'end' });
  });

  it('if branch-tail → next-root edges are generated', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'if1',
        type: 'staticSplit',
        data: { ruleNodeType: 'if', title: 'If', config: { expression: '1 == 1' } },
        blocks: [
          makeBranchBlock('if1_t', 'if_block', 'True', {}, [makeNode('t_act', 'log')]),
          makeBranchBlock('if1_f', 'if_block', 'False', {}, [makeNode('f_act', 'delay')]),
        ],
      } as FlowNodeJSON,
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    expect(result.edges).toContainEqual({ from: 't_act', to: 'end' });
    expect(result.edges).toContainEqual({ from: 'f_act', to: 'end' });
  });

  it('switch branch-tail → next-root edges are generated', () => {
    const docNodes: FlowNodeJSON[] = [
      makeNode('start', 'start'),
      {
        id: 'switch',
        type: 'dynamicSplit',
        data: { ruleNodeType: 'switch', title: 'Switch', config: { join_at: 'join' } },
        blocks: [
          makeBranchBlock('sw_b0', 'case', 'Case 1', { condition: 'x > 0' }, [makeNode('a1', 'log')]),
          makeBranchBlock('sw_b1', 'case_default', '默认', {}, [makeNode('a2', 'delay')]),
        ],
      } as FlowNodeJSON,
      makeNode('join', 'join'),
      makeNode('end', 'end'),
    ];
    const result = flowDocumentToDsl({ nodes: docNodes }, 'test', '1.0');
    expect(result.edges).toContainEqual({ from: 'a1', to: 'join' });
    expect(result.edges).toContainEqual({ from: 'a2', to: 'join' });
  });
});
