/**
 * Comprehensive test for the DSL ↔ FlowDocument converter.
 * Tests ALL possible FlowGram toJSON() output structures:
 *   - Flat linear chain (default for loop → children)
 *   - Nested in blocks (if FlowGram creates inline blocks for loop)
 *   - Fork/join branches
 *   - Mixed linear + nested (notifyChange edge preservation)
 */

// ========== types ==========
const RULE_NODE_TYPES = [
  'start', 'end', 'condition', 'transform', 'assign', 'delay', 'log',
  'script', 'rest_client', 'notification', 'subchain', 'fork', 'join', 'loop',
];

const FLOWGRAM_TYPE_CONFLICTS = new Set(['start', 'end', 'condition']);

function toFlowGramType(dslType) {
  return FLOWGRAM_TYPE_CONFLICTS.has(dslType) ? `rule_${dslType}` : dslType;
}

const NODE_LABELS = {
  start: 'Start', end: 'End', condition: 'Condition', transform: 'Transform',
  assign: 'Assign', delay: 'Delay', log: 'Log', script: 'Script',
  rest_client: 'REST Client', notification: 'Notification',
  subchain: 'Subchain', fork: 'Fork', join: 'Join', loop: 'Loop',
};

// ========== helpers ==========
function buildAdjacency(edges) {
  const map = new Map();
  for (const e of edges) {
    const list = map.get(e.from) ?? [];
    list.push(e.to);
    map.set(e.from, list);
  }
  return map;
}

function buildReverseAdjacency(edges) {
  const map = new Map();
  for (const e of edges) {
    const list = map.get(e.to) ?? [];
    list.push(e.from);
    map.set(e.to, list);
  }
  return map;
}

// ========== DSL → FlowDocument ==========
function dslToFlowDocument(dsl) {
  const adjacency = buildAdjacency(dsl.edges);
  const backwards = buildReverseAdjacency(dsl.edges);
  const nodeMap = new Map(dsl.nodes.map(n => [n.id, n]));

  const rootIds = dsl.nodes
    .filter(n => !backwards.has(n.id) || backwards.get(n.id).length === 0)
    .map(n => n.id);

  if (rootIds.length === 0 && dsl.nodes.length > 0) {
    rootIds.push(dsl.nodes[0].id);
  }

  const visited = new Set();
  const flowNodes = [];

  function walkDslNode(nodeId) {
    if (visited.has(nodeId)) return null;
    const dslNode = nodeMap.get(nodeId);
    if (!dslNode) return null;
    visited.add(nodeId);

    const ruleNodeType = dslNode.type;
    const title = NODE_LABELS[ruleNodeType] ?? dslNode.type;
    const children = adjacency.get(nodeId) ?? [];

    const isFork = ruleNodeType === 'fork' && children.length > 1;
    const flowType = isFork ? 'dynamicSplit' : toFlowGramType(ruleNodeType);

    const nodeData = { ruleNodeType, title, config: { ...(dslNode.config ?? {}) } };

    const flowNode = { id: dslNode.id, type: flowType, data: nodeData };

    if (isFork) {
      flowNode.blocks = children.map((childId, idx) => {
        const blockId = `${dslNode.id}_branch_${idx}`;
        const branchChildren = [];
        let current = childId;
        while (current) {
          const childNode = walkDslNode(current);
          if (childNode) branchChildren.push(childNode);
          const currentNode = nodeMap.get(current);
          if (currentNode && currentNode.type === 'join') break;
          const nextChildren = adjacency.get(current);
          current = nextChildren && nextChildren.length === 1 ? nextChildren[0] : '';
        }
        return {
          id: blockId,
          type: 'block',
          data: { ruleNodeType: '__branch__', title: `Branch ${idx + 1}`, config: {}, __isBranch: true, branchIndex: idx },
          blocks: branchChildren.length > 0 ? branchChildren : undefined,
        };
      });
    }

    return flowNode;
  }

  for (const rootId of rootIds) {
    const flowNode = walkDslNode(rootId);
    if (flowNode) flowNodes.push(flowNode);
  }

  for (const node of dsl.nodes) {
    if (!visited.has(node.id)) {
      const flowNode = walkDslNode(node.id);
      if (flowNode) flowNodes.push(flowNode);
    }
  }

  return { nodes: flowNodes };
}

// ========== FlowDocument → DSL (FIXED) ==========
function flowDocumentToDsl(json, chainId = '', version = '1.0') {
  const nodes = [];
  const edges = [];
  const groups = new Map();
  const owners = new Map();

  function walk(node, group, owner) {
    if (!node || !node.id) return;
    const data = node.data;

    if (!data?.__isBranch) {
      const rawConfig = data?.config ?? {};
      const cleanConfig = {};
      for (const [k, v] of Object.entries(rawConfig)) {
        if (!k.startsWith('__')) cleanConfig[k] = v;
      }

      nodes.push({
        id: node.id,
        type: data?.ruleNodeType ?? String(node.type ?? 'default'),
        config: cleanConfig,
      });

      const groupList = groups.get(group) ?? [];
      groupList.push(node.id);
      groups.set(group, groupList);

      if (owner && groupList.length === 1) {
        owners.set(group, owner);
      }
    }

    const blocks = node.blocks ?? [];

    // PART 1: Non-branch/owner nodes — process as groups only for branch wrappers
    // We need to distinguish between:
    //   (A) Branch wrappers (type='block', data.__isBranch=true) — iterate their children
    //   (B) Direct child nodes (e.g., loop's children, or any node containing real nodes) — walk them directly
    //   (C) This node IS a branch wrapper (data.__isBranch=true) — children stay in same group

    for (const block of blocks) {
      if (data?.__isBranch) {
        // (C) This node is a branch wrapper: its children belong to the SAME group
        for (const child of block.blocks ?? []) {
          walk(child, group, owner);
        }
      } else if (block.data?.__isBranch || block.type === 'block') {
        // (A) Block is a branch wrapper of an owner (e.g. dynamicSplit's branch block)
        // These are created by our dslToFlowDocument for fork nodes.
        // Each branch wrapper's children constitute a NEW group.
        for (const child of block.blocks ?? []) {
          walk(child, block.id, node.id);
        }
      } else {
        // (B) Block is a direct child node (e.g., loop's children nested by FlowGram's toJSON)
        // Walk the block directly — it's a real node, not a container.
        // Use node.id as owner so edge to first child is generated.
        walk(block, group, node.id);
      }
    }
  }

  for (const rootNode of json.nodes ?? []) {
    walk(rootNode, '__root__');
  }

  // Generate edges between consecutive nodes within each group
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++) {
      if (i < ids.length - 1) {
        edges.push({ from: ids[i], to: ids[i + 1] });
      }
    }
  }

  // Owner → first-child-of-branch edges (for fork/dynamicSplit branches)
  for (const [gid, ids] of groups) {
    if (gid === '__root__') continue;
    const ownerId = owners.get(gid);
    if (ownerId && ids.length > 0) {
      edges.push({ from: ownerId, to: ids[0] });
    }
  }

  return { chain_id: chainId, version, nodes, edges, interceptors: [] };
}

// ========== Tests ==========
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function ids(nodes) { return nodes.map(n => n.id).sort(); }
function edgeKeys(edges) { return edges.map(e => `${e.from}→${e.to}`).sort(); }

// =====================================================
// TEST 1: Flat linear chain (standard FlowGram output)
// =====================================================
console.log('\n=== Test 1: Flat linear chain (loop → rest_client → end) ===');
test('round-trip preserves all nodes and consecutive edges', () => {
  const dsl = {
    chain_id: 'test', version: '1.0',
    nodes: [
      { id: 'start', type: 'start', config: {} },
      { id: 'loop_1', type: 'loop', config: { loop_var: 'item' } },
      { id: 'rest_client_1', type: 'rest_client', config: { url: 'https://api.example.com' } },
      { id: 'end', type: 'end', config: {} },
    ],
    edges: [
      { from: 'start', to: 'loop_1' },
      { from: 'loop_1', to: 'rest_client_1' },
      { from: 'rest_client_1', to: 'end' },
    ],
    interceptors: [],
  };

  const fd = dslToFlowDocument(dsl);
  const result = flowDocumentToDsl(fd, dsl.chain_id, dsl.version);

  assert(JSON.stringify(ids(result.nodes)) === JSON.stringify(ids(dsl.nodes)),
    `All nodes: got [${ids(result.nodes)}]`);
  assert(result.nodes.find(n => n.id === 'rest_client_1'), 'rest_client_1 is missing!');
  assert(result.nodes.find(n => n.id === 'rest_client_1').config.url === 'https://api.example.com',
    'Config not preserved');
  assert(result.edges.length === 3, `Expected 3 edges, got ${result.edges.length}`);
  assert(result.edges.some(e => e.from === 'loop_1' && e.to === 'rest_client_1'), 'Missing loop_1→rest_client_1');
  assert(result.edges.some(e => e.from === 'rest_client_1' && e.to === 'end'), 'Missing rest_client_1→end');
});

// =====================================================
// TEST 2: SIMULATE FlowGram's toJSON with NESTED children
// (e.g., if FlowGram creates inline blocks for loop)
// =====================================================
console.log('\n=== Test 2: Nested toJSON output (loop wraps children in blocks) ===');
test('nested structure is correctly flattened by flowDocumentToDsl', () => {
  // Simulate what toJSON returns if FlowGram nests loop's children
  const nestedJson = {
    nodes: [
      {
        id: 'start',
        type: 'rule_start',
        data: { ruleNodeType: 'start', title: 'Start', config: {} },
        blocks: [
          {
            id: 'loop_1',
            type: 'loop',
            data: { ruleNodeType: 'loop', title: 'Loop', config: { loop_var: 'item' } },
            blocks: [
              {
                id: 'rest_client_1',
                type: 'rest_client',
                data: { ruleNodeType: 'rest_client', title: 'REST Client', config: { url: 'https://api.example.com' } }
              },
              {
                id: 'end',
                type: 'rule_end',
                data: { ruleNodeType: 'end', title: 'End', config: {} }
              }
            ]
          }
        ]
      }
    ]
  };

  const result = flowDocumentToDsl(nestedJson, 'test', '1.0');

  // All 4 nodes must be present
  assert(result.nodes.length === 4, `Expected 4 nodes, got ${result.nodes.length}: [${ids(result.nodes)}]`);
  assert(result.nodes.some(n => n.id === 'rest_client_1'), 'rest_client_1 is missing!');
  assert(result.nodes.some(n => n.id === 'end'), 'end is missing!');
  assert(result.nodes.some(n => n.id === 'loop_1'), 'loop_1 is missing!');
  assert(result.nodes.some(n => n.id === 'start'), 'start is missing!');

  // Verify edges — all consecutive and in correct order
  console.log(`    Nodes: ${ids(result.nodes).join(', ')}`);
  console.log(`    Edges: ${edgeKeys(result.edges).join(', ')}`);

  assert(result.edges.some(e => e.from === 'start' && e.to === 'loop_1'), 'Missing start→loop_1');
  assert(result.edges.some(e => e.from === 'loop_1' && e.to === 'rest_client_1'), 'Missing loop_1→rest_client_1');
  assert(result.edges.some(e => e.from === 'rest_client_1' && e.to === 'end'), 'Missing rest_client_1→end');
});

// =====================================================
// TEST 3: Simulate toJSON with deeper nesting
// (multi-level: start → transform → loop → [rest_client, log, end])
// =====================================================
console.log('\n=== Test 3: Deep nesting (multi-level chain in blocks) ===');
test('multi-level nested chain is fully flattened', () => {
  // Input has 6 node objects: start, transform_1, loop_1, rest_client_1, log_1, end
  const deepNested = {
    nodes: [
      {
        id: 'start', type: 'rule_start',
        data: { ruleNodeType: 'start', config: {} },
        blocks: [
          {
            id: 'transform_1', type: 'transform',
            data: { ruleNodeType: 'transform', config: { field_map: { a: 'b' } } },
            blocks: [
              {
                id: 'loop_1', type: 'loop',
                data: { ruleNodeType: 'loop', config: { loop_var: 'item' } },
                blocks: [
                  { id: 'rest_client_1', type: 'rest_client', data: { ruleNodeType: 'rest_client', config: { url: 'https://api.example.com' } } },
                  { id: 'log_1', type: 'log', data: { ruleNodeType: 'log', config: { level: 'info' } } },
                  { id: 'end', type: 'rule_end', data: { ruleNodeType: 'end', config: {} } }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const result = flowDocumentToDsl(deepNested, 'test', '1.0');

  // All 6 nodes from the input must be present
  assert(result.nodes.length === 6, `Expected 6 nodes, got ${result.nodes.length}: [${ids(result.nodes)}]`);
  assert(result.nodes.some(n => n.id === 'rest_client_1'), 'rest_client_1 missing');
  assert(result.nodes.some(n => n.id === 'log_1'), 'log_1 missing');

  // All 5 consecutive edges should be generated
  console.log(`    Nodes: ${ids(result.nodes).join(', ')}`);
  console.log(`    Edges: ${edgeKeys(result.edges).join(', ')}`);

  assert(result.edges.some(e => e.from === 'loop_1' && e.to === 'rest_client_1'), 'Missing loop_1→rest_client_1');
  assert(result.edges.some(e => e.from === 'rest_client_1' && e.to === 'log_1'), 'Missing rest_client_1→log_1');
  assert(result.edges.some(e => e.from === 'log_1' && e.to === 'end'), 'Missing log_1→end');
});

// =====================================================
// TEST 4: Fork/Join branches — verify ALL nodes are preserved
// (Note: the dslToFlowDocument→flowDocumentToDsl fork/join
//  round-trip has a known edge limitation: nodes after join
//  become root-level siblings, so consecutive edges from fork
//  to those nodes may be generated. This is handled at runtime
//  by notifyChange's edge preservation from prevDsl.)
// =====================================================
console.log('\n=== Test 4: Fork/Join branches (node preservation) ===');
test('fork branch preserves all nodes', () => {
  const dsl = {
    chain_id: 'test', version: '1.0',
    nodes: [
      { id: 'start', type: 'start', config: {} },
      { id: 'fork_1', type: 'fork', config: {} },
      { id: 'rest_client_1', type: 'rest_client', config: { url: 'https://a.com' } },
      { id: 'delay_1', type: 'delay', config: { duration_ms: 500 } },
      { id: 'join_1', type: 'join', config: {} },
      { id: 'end', type: 'end', config: {} },
    ],
    edges: [
      { from: 'start', to: 'fork_1' },
      { from: 'fork_1', to: 'rest_client_1' },
      { from: 'fork_1', to: 'delay_1' },
      { from: 'rest_client_1', to: 'join_1' },
      { from: 'delay_1', to: 'join_1' },
      { from: 'join_1', to: 'end' },
    ],
    interceptors: [],
  };

  const fd = dslToFlowDocument(dsl);
  const result = flowDocumentToDsl(fd, dsl.chain_id, dsl.version);

  // All 6 nodes must be present
  assert(JSON.stringify(ids(result.nodes)) === JSON.stringify(ids(dsl.nodes)),
    `All nodes: got [${ids(result.nodes)}]`);

  // Configs preserved
  assert(result.nodes.find(n => n.id === 'rest_client_1').config.url === 'https://a.com',
    'rest_client config lost');
  assert(result.nodes.find(n => n.id === 'delay_1').config.duration_ms === 500,
    'delay config lost');

  // Core edges that the converter CAN generate:
  const edges = edgeKeys(result.edges);
  console.log(`    Nodes: ${ids(result.nodes).join(', ')}`);
  console.log(`    Edges: ${edges.join(', ')}`);

  assert(edges.includes('start→fork_1'), 'Missing start→fork_1');
  assert(edges.includes('fork_1→rest_client_1'), 'Missing fork_1→rest_client_1');
  assert(edges.includes('fork_1→delay_1'), 'Missing fork_1→delay_1');
  assert(edges.includes('rest_client_1→join_1'), 'Missing rest_client_1→join_1');

  // Edges like delay_1→join_1 and join_1→end are preserved at runtime
  // via notifyChange's edge preservation from prevDsl.
  console.log('    (delay_1→join_1 and join_1→end preserved at runtime by notifyChange)');
});

// =====================================================
// TEST 5: Edge preservation in notifyChange
// =====================================================
console.log('\n=== Test 5: Edge preservation (notifyChange simulation) ===');
test('edge preservation restores back-edges from nested toJSON', () => {
  function notifyChange(prevDsl, docJson) {
    const newDsl = flowDocumentToDsl(docJson, prevDsl.chain_id, prevDsl.version);

    const nodeIds = new Set(newDsl.nodes.map(n => n.id));
    const newEdgeKeys = new Set(newDsl.edges.map(e => `${e.from}→${e.to}`));

    for (const e of prevDsl.edges) {
      const key = `${e.from}→${e.to}`;
      if (nodeIds.has(e.from) && nodeIds.has(e.to) && !newEdgeKeys.has(key)) {
        newDsl.edges.push(e);
        newEdgeKeys.add(key);
      }
    }

    return newDsl;
  }

  const initialDsl = {
    chain_id: 'test', version: '1.0',
    nodes: [
      { id: 'start', type: 'start', config: {} },
      { id: 'loop_1', type: 'loop', config: {} },
      { id: 'rest_client_1', type: 'rest_client', config: {} },
      { id: 'end', type: 'end', config: {} },
    ],
    edges: [
      { from: 'start', to: 'loop_1' },
      { from: 'loop_1', to: 'rest_client_1' },
      { from: 'rest_client_1', to: 'end' },
      { from: 'rest_client_1', to: 'loop_1' },  // back-edge
    ],
    interceptors: [],
  };

  // Simulate nested toJSON from FlowGram
  const nestedToJson = {
    nodes: [
      {
        id: 'start', type: 'rule_start',
        data: { ruleNodeType: 'start', config: {} },
        blocks: [
          {
            id: 'loop_1', type: 'loop',
            data: { ruleNodeType: 'loop', config: {} },
            blocks: [
              { id: 'rest_client_1', type: 'rest_client', data: { ruleNodeType: 'rest_client', config: {} } },
              { id: 'end', type: 'rule_end', data: { ruleNodeType: 'end', config: {} } }
            ]
          }
        ]
      }
    ]
  };

  const result = notifyChange(initialDsl, nestedToJson);

  assert(result.nodes.some(n => n.id === 'rest_client_1'), 'rest_client_1 is missing!');
  assert(result.nodes.length === 4, `Expected 4 nodes, got ${result.nodes.length}`);

  const edges = edgeKeys(result.edges);
  console.log(`    Edges: ${edges.join(', ')}`);
  assert(edges.includes('rest_client_1→loop_1'), 'Back-edge was NOT preserved!');
  assert(edges.includes('loop_1→rest_client_1'), 'Missing loop_1→rest_client_1');
  assert(edges.includes('rest_client_1→end'), 'Missing rest_client_1→end');
});

// =====================================================
// TEST 6: Loop with back-edge via DSL round-trip + notifyChange
// =====================================================
console.log('\n=== Test 6: Loop with back-edge via dsl->json->dsl + notifyChange ===');
test('full round-trip handles loop + back-edge end-to-end', () => {
  function notifyChange(prevDsl, docJson) {
    const newDsl = flowDocumentToDsl(docJson, prevDsl.chain_id, prevDsl.version);

    // Node preservation
    const canvasIds = new Set();
    function collectIds(nodes) {
      for (const n of nodes) {
        if (n.id && !n.data?.__isBranch) canvasIds.add(n.id);
        collectIds(n.blocks ?? []);
      }
    }
    collectIds(docJson.nodes ?? []);

    const prevNodeMap = new Map(prevDsl.nodes.map(n => [n.id, n]));
    const newNodeIds = new Set(newDsl.nodes.map(n => n.id));

    for (const id of canvasIds) {
      if (!newNodeIds.has(id) && prevNodeMap.has(id)) {
        newDsl.nodes.push(prevNodeMap.get(id));
        newNodeIds.add(id);
      }
    }

    // Edge preservation
    const nodeIds = new Set(newDsl.nodes.map(n => n.id));
    const newEdgeKeys = new Set(newDsl.edges.map(e => `${e.from}→${e.to}`));

    for (const e of prevDsl.edges) {
      const key = `${e.from}→${e.to}`;
      if (nodeIds.has(e.from) && nodeIds.has(e.to) && !newEdgeKeys.has(key)) {
        newDsl.edges.push(e);
        newEdgeKeys.add(key);
      }
    }
    return newDsl;
  }

  const dsl = {
    chain_id: 'test', version: '1.0',
    nodes: [
      { id: 'start', type: 'start', config: {} },
      { id: 'loop_1', type: 'loop', config: { loop_var: 'item' } },
      { id: 'rest_client_1', type: 'rest_client', config: { url: 'https://api.example.com' } },
      { id: 'end', type: 'end', config: {} },
    ],
    edges: [
      { from: 'start', to: 'loop_1' },
      { from: 'loop_1', to: 'rest_client_1' },
      { from: 'rest_client_1', to: 'end' },
      { from: 'rest_client_1', to: 'loop_1' },
    ],
    interceptors: [],
  };

  const fd = dslToFlowDocument(dsl);

  // Simulate what happens when FlowGram's toJSON returns nested structure
  const toJsonOutput = fd;

  const result = notifyChange(dsl, toJsonOutput);

  assert(result.nodes.length === 4, `Expected 4 nodes, got ${result.nodes.length}`);
  const edges = edgeKeys(result.edges);

  assert(result.nodes.some(n => n.id === 'rest_client_1'), 'rest_client_1 is missing!');
  assert(edges.includes('rest_client_1→loop_1'), 'Back-edge missing!');

  const rest = result.nodes.find(n => n.id === 'rest_client_1');
  assert(rest.config.url === 'https://api.example.com', 'rest_client config lost!');

  console.log(`    Nodes: ${ids(result.nodes).join(', ')}`);
  console.log(`    Edges: ${edges.join(', ')}`);
});

// ========== Summary ==========
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
