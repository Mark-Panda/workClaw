/**
 * 独立自测脚本 — 模拟 converter.ts 的完整逻辑链，不依赖 FlowGram/Vite 运行时。
 * 复制 converter.ts 和 types.ts 的核心逻辑，在纯 Node.js 环境中测试。
 */

// ─── 类型定义 ────────────────────────────────────────────────────

class FlowNodeJSON {
  constructor({ id, type, data, blocks }) {
    this.id = id;
    this.type = type;
    this.data = data ?? {};
    this.blocks = blocks;
  }
}

class FlowDocumentJSON {
  constructor({ nodes }) {
    this.nodes = nodes;
  }
}

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

// ─── 检测工具 ────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;

function checkResult(label, output, expected) {
  const errors = [];

  for (const e of expected.edges) {
    const found = output.edges.some((oe) => oe.from === e.from && oe.to === e.to);
    if (!found) {
      errors.push(`缺失边: ${e.from}→${e.to}`);
    }
  }

  for (const e of output.edges) {
    if (e.from === 'end') {
      errors.push(`非法边(end→${e.to})`);
    }
  }

  const nodeIds = new Set(output.nodes.map((n) => n.id));
  for (const e of output.edges) {
    if (!nodeIds.has(e.from)) errors.push(`边 ${e.from}→${e.to} 引用不存在的来源节点: ${e.from}`);
    if (!nodeIds.has(e.to)) errors.push(`边 ${e.from}→${e.to} 引用不存在的目标节点: ${e.to}`);
  }

  if (errors.length === 0) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.log(`  ✗ ${label}:`);
    for (const err of errors) {
      console.log(`    - ${err}`);
    }
    failCount++;
  }
}

// ─── DSL → FlowDocument ────────────────────────────────────────

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

function walkDslNode(nodeId, nodeMap, adjacency, visited) {
  if (visited.has(nodeId)) return null;
  const dslNode = nodeMap.get(nodeId);
  if (!dslNode) return null;
  visited.add(nodeId);

  const ruleNodeType = dslNode.type;
  const title = NODE_LABELS[ruleNodeType] ?? dslNode.type;
  const children = adjacency.get(nodeId) ?? [];

  const isFork = ruleNodeType === 'fork' && children.length > 1;
  const isContainer = (ruleNodeType === 'loop' || ruleNodeType === 'subchain') && children.length > 1;

  const flowType = isFork ? 'dynamicSplit' : toFlowGramType(ruleNodeType);

  const nodeData = { ruleNodeType, title, config: { ...(dslNode.config ?? {}) } };

  const flowNode = new FlowNodeJSON({ id: dslNode.id, type: flowType, data: nodeData });

  if (isFork) {
    flowNode.blocks = children.map((childId, idx) => {
      const blockId = `${dslNode.id}_branch_${idx}`;
      const branchChildren = [];
      let current = childId;
      while (current) {
        const currentNode = nodeMap.get(current);
        if (currentNode && currentNode.type === 'join') break;
        const childNode = walkDslNode(current, nodeMap, adjacency, visited);
        if (childNode) branchChildren.push(childNode);
        const nextChildren = adjacency.get(current);
        current = nextChildren && nextChildren.length === 1 ? nextChildren[0] : '';
      }
      return new FlowNodeJSON({
        id: blockId,
        type: 'block',
        data: { ruleNodeType: '__branch__', title: `Branch ${idx + 1}`, config: {}, __isBranch: true, branchIndex: idx },
        blocks: branchChildren.length > 0 ? branchChildren : undefined,
      });
    });
  }

  if (isContainer) {
    const childSet = new Set(children);

    const flowChildIdx = children.findIndex((childId) => {
      const childDslNode = nodeMap.get(childId);
      if (childDslNode && childDslNode.type === 'end') return true;
      const out = adjacency.get(childId) ?? [];
      return out.some((t) => !childSet.has(t) && t !== nodeId);
    });

    const flowIdx = flowChildIdx >= 0 ? flowChildIdx : 0;
    const bodyChildren = children.filter((_, i) => i !== flowIdx);

    if (bodyChildren.length > 0) {
      const bodyNodes = [];
      for (const childId of bodyChildren) {
        let current = childId;
        while (current) {
          const n = walkDslNode(current, nodeMap, adjacency, visited);
          if (n) bodyNodes.push(n);
          const next = adjacency.get(current);
          current = next && next.length === 1 ? next[0] : '';
        }
      }
      flowNode.blocks = [
        new FlowNodeJSON({
          id: `${dslNode.id}__body`,
          type: 'block',
          data: { ruleNodeType: '__body__', title: 'Body', config: {}, __isBranch: true },
          blocks: bodyNodes.length > 0 ? bodyNodes : undefined,
        }),
      ];
    }
  }

  return flowNode;
}

function dslToFlowDocument(dsl) {
  const adjacency = buildAdjacency(dsl.edges);
  const backwards = buildReverseAdjacency(dsl.edges);
  const nodeMap = new Map(dsl.nodes.map((n) => [n.id, n]));

  const rootIds = dsl.nodes
    .filter((n) => !backwards.has(n.id) || backwards.get(n.id).length === 0)
    .map((n) => n.id);

  if (rootIds.length === 0 && dsl.nodes.length > 0) {
    rootIds.push(dsl.nodes[0].id);
  }

  const visited = new Set();
  const flowNodes = [];

  for (const rootId of rootIds) {
    const flowNode = walkDslNode(rootId, nodeMap, adjacency, visited);
    if (flowNode) flowNodes.push(flowNode);
  }

  {
    const unvisitedIds = new Set(
      dsl.nodes.filter((n) => !visited.has(n.id)).map((n) => n.id),
    );

    if (unvisitedIds.size > 0) {
      const fwd = new Map();
      const rev = new Map();
      for (const e of dsl.edges) {
        if (unvisitedIds.has(e.from) && unvisitedIds.has(e.to)) {
          const list = fwd.get(e.from) ?? [];
          list.push(e.to);
          fwd.set(e.from, list);
          const revList = rev.get(e.to) ?? [];
          revList.push(e.from);
          rev.set(e.to, revList);
        }
      }

      const entries = [...unvisitedIds].filter((id) => !rev.has(id));
      const queue = [...entries];

      while (queue.length > 0) {
        const id = queue.shift();
        if (!unvisitedIds.has(id)) continue;
        unvisitedIds.delete(id);
        const flowNode = walkDslNode(id, nodeMap, adjacency, visited);
        if (flowNode) flowNodes.push(flowNode);
        for (const next of fwd.get(id) ?? []) {
          if (unvisitedIds.has(next)) queue.push(next);
        }
      }

      for (const id of unvisitedIds) {
        const flowNode = walkDslNode(id, nodeMap, adjacency, visited);
        if (flowNode) flowNodes.push(flowNode);
      }
    }
  }

  return new FlowDocumentJSON({ nodes: flowNodes });
}

// ─── FlowDocument → DSL ────────────────────────────────────────

function flowDocumentToDsl(json, chainId = '', version = '1.0') {
  const nodes = [];
  const edges = [];

  const groups = new Map();
  const owners = new Map();

  function walk(node, group, owner) {
    if (!node || !node.id) return;
    const data = node.data ?? {};

    if (!data.__isBranch) {
      const rawConfig = data.config ?? {};
      const cleanConfig = {};
      for (const [k, v] of Object.entries(rawConfig)) {
        if (!k.startsWith('__')) cleanConfig[k] = v;
      }

      nodes.push({
        id: node.id,
        type: data.ruleNodeType ?? String(node.type ?? 'default'),
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
    for (const block of blocks) {
      if (data?.__isBranch) {
        for (const child of block.blocks ?? []) {
          walk(child, group, owner);
        }
      } else if (block.data?.__isBranch || block.type === 'block') {
        for (const child of block.blocks ?? []) {
          walk(child, block.id, node.id);
        }
      } else {
        walk(block, `${node.id}__children`, node.id);
      }
    }
  }

  for (const rootNode of json.nodes ?? []) {
    walk(rootNode, '__root__');
  }

  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type]));

  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++) {
      if (i >= ids.length - 1) break;
      const a = ids[i];
      const b = ids[i + 1];
      if (nodeTypeMap.get(a) === 'end') continue;
      if (nodeTypeMap.get(a) === 'fork' && nodeTypeMap.get(b) === 'join') continue;
      // If b is 'end' and there are more nodes after b, wire around it
      if (nodeTypeMap.get(b) === 'end' && i + 2 < ids.length) {
        const c = ids[i + 2];
        if (nodeTypeMap.get(c) !== 'end') {
          edges.push({ from: a, to: c });
          edges.push({ from: c, to: b });
          i++; // consume 'end'; next iteration starts at c
          continue;
        }
      }
      edges.push({ from: a, to: b });
    }
  }

  for (const [gid, ids] of groups) {
    if (gid === '__root__') continue;
    const ownerId = owners.get(gid);
    if (ownerId && ids.length > 0) {
      edges.push({ from: ownerId, to: ids[0] });
    }
  }

  return {
    chain_id: chainId,
    version,
    nodes,
    edges,
    interceptors: [],
  };
}

// ─── reorderByTopology ────────────────────────────────────────────
function reorderByTopology(nodes, edges) {
  if (edges.length === 0) return nodes;

  const adj = new Map();
  const rev = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
    if (!rev.has(e.to)) rev.set(e.to, []);
    rev.get(e.to).push(e.from);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const visited = new Set();
  const sorted = [];

  function dfs(id) {
    if (visited.has(id) || !nodeIds.has(id)) return;
    visited.add(id);
    const n = nodeMap.get(id);
    if (n) sorted.push(n);
    for (const next of adj.get(id) ?? []) dfs(next);
  }

  const edgeNodeIds = new Set();
  for (const e of edges) { edgeNodeIds.add(e.from); edgeNodeIds.add(e.to); }

  for (const n of nodes) {
    if (edgeNodeIds.has(n.id) && !rev.has(n.id)) dfs(n.id);
  }

  const sortedIds = new Set(sorted.map((n) => n.id));
  const result = [];
  let si = 0;

  for (const n of nodes) {
    if (sortedIds.has(n.id)) {
      const idx = sorted.findIndex((s, i) => i >= si && s.id === n.id);
      if (idx >= 0) {
        for (; si < idx; si++) result.push(sorted[si]);
        if (si < sorted.length && sorted[si].id === n.id) {
          result.push(sorted[si]);
          si++;
        }
      }
    } else {
      result.push(n);
    }
  }

  for (; si < sorted.length; si++) result.push(sorted[si]);

  return result;
}

// ─── simulateNotifyChange ─────────────────────────────────────────
function collectCanvasNodeIds(nodes) {
  const ids = new Set();
  function walk(list) {
    for (const n of list) {
      if (n.id && !(n.data ?? {})?.__isBranch) {
        ids.add(n.id);
      }
      walk(n.blocks ?? []);
    }
  }
  walk(nodes);
  return ids;
}

function simulateNotifyChange(docJson, prevDsl) {
  docJson.nodes = reorderByTopology(docJson.nodes ?? [], prevDsl.edges);

  const newDsl = flowDocumentToDsl(docJson, prevDsl.chain_id, prevDsl.version);

  const canvasIds = collectCanvasNodeIds(docJson.nodes ?? []);
  const prevNodeMap = new Map(prevDsl.nodes.map((n) => [n.id, n]));
  const newNodeIds = new Set(newDsl.nodes.map((n) => n.id));

  for (const id of canvasIds) {
    if (!newNodeIds.has(id) && prevNodeMap.has(id)) {
      newDsl.nodes.push(prevNodeMap.get(id));
      newNodeIds.add(id);
    }
  }

  const CONTAINER_TYPES = new Set(['loop', 'fork', 'subchain']);
  const newNodeMap = new Map(newDsl.nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(newDsl.nodes.map((n) => n.id));
  const newEdgeKeys = new Set(newDsl.edges.map((e) => `${e.from}→${e.to}`));

  // Build outgoing-edge map from newDsl to detect stale prevDsl edges
  const newDslOutgoing = new Map();
  for (const e of newDsl.edges) {
    const list = newDslOutgoing.get(e.from) ?? [];
    list.push(e.to);
    newDslOutgoing.set(e.from, list);
  }

  for (const e of prevDsl.edges) {
    const key = `${e.from}→${e.to}`;
    if (nodeIds.has(e.from) && nodeIds.has(e.to) && !newEdgeKeys.has(key)) {
      const srcType = newNodeMap.get(e.from)?.type ?? '';
      const tgtType = newNodeMap.get(e.to)?.type ?? '';
      if (srcType === 'end') continue;

      // Stale edge detection
      const existingTargets = newDslOutgoing.get(e.from);
      if (existingTargets && existingTargets.length > 0) {
        if (!CONTAINER_TYPES.has(tgtType) && tgtType !== 'join') {
          continue; // stale — skip
        }
      }

      if (CONTAINER_TYPES.has(srcType) || CONTAINER_TYPES.has(tgtType) || tgtType === 'join') {
        newDsl.edges.push(e);
        newEdgeKeys.add(key);
      }
    }
  }

  return newDsl;
}

// ══════════════════════════════════════════════════════════════════
//  场景测试
// ══════════════════════════════════════════════════════════════════

// ─── 场景 1: start → transform → loop → subchain → end, loop → notification ───
console.log('='.repeat(70));
console.log('场景 1: start → transform → loop → subchain → end, loop → notification');
console.log('='.repeat(70));

const dsl1 = {
  chain_id: 'test1',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'transform_1', type: 'transform', config: {} },
    { id: 'loop', type: 'loop', config: {} },
    { id: 'subchain', type: 'subchain', config: {} },
    { id: 'end', type: 'end', config: {} },
    { id: 'notification', type: 'notification', config: {} },
  ],
  edges: [
    { from: 'start', to: 'transform_1' },
    { from: 'transform_1', to: 'loop' },
    { from: 'loop', to: 'subchain' },
    { from: 'loop', to: 'notification' },
    { from: 'subchain', to: 'end' },
  ],
  interceptors: [],
};

// dsl → FlowDocument
const doc1 = dslToFlowDocument(dsl1);
console.log('\ndsl → FlowDocument:');
console.log(`  Root nodes: ${doc1.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`);

const loopNode = doc1.nodes.find((n) => n.id === 'loop');
if (loopNode && loopNode.blocks) {
  console.log(`  Loop blocks: ${loopNode.blocks.length}`);
  loopNode.blocks.forEach((b, i) => {
    const blockNodes = (b.blocks ?? []).map((n) => `${n.id}(${n.type})`).join(', ');
    console.log(`    Block ${i}: ${b.id} → [${blockNodes}]`);
  });
}

// 正常顺序 → DSL
const dsl1back = flowDocumentToDsl(doc1, dsl1.chain_id, dsl1.version);
console.log('\n正常顺序 → DSL edges: ' + dsl1back.edges.map((e) => `${e.from}→${e.to}`).join(', '));
checkResult('正常顺序', dsl1back, dsl1);

// 模拟 FlowGram 乱序
const reorderedNodes = [...doc1.nodes];
const end1Idx = reorderedNodes.findIndex((n) => n.id === 'end');
const subchain1Idx = reorderedNodes.findIndex((n) => n.id === 'subchain');
reorderedNodes[end1Idx] = doc1.nodes[subchain1Idx];
reorderedNodes[subchain1Idx] = doc1.nodes[end1Idx];

console.log(`\n模拟 FlowGram 乱序: [${reorderedNodes.map((n) => n.id).join(', ')}]`);

// 不修复的情况下
const dsl1Bad = flowDocumentToDsl(new FlowDocumentJSON({ nodes: reorderedNodes }), dsl1.chain_id, dsl1.version);
console.log('  不修复 edges: ' + dsl1Bad.edges.map((e) => `${e.from}→${e.to}`).join(', '));

// notifyChange 修复后
const result1 = simulateNotifyChange(new FlowDocumentJSON({ nodes: reorderedNodes }), dsl1);
console.log('  修复后 edges: ' + result1.edges.map((e) => `${e.from}→${e.to}`).join(', '));
checkResult('完整 notifyChange', result1, dsl1);

// ─── 场景 2: start → condition → loop → notification → end, loop → rest_client ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 2: start → condition → loop → notification → end, loop → rest_client');
console.log('='.repeat(70));

const dsl2 = {
  chain_id: 'test2',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'condition', type: 'condition', config: {} },
    { id: 'loop', type: 'loop', config: {} },
    { id: 'rest_client', type: 'rest_client', config: {} },
    { id: 'notification', type: 'notification', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'condition' },
    { from: 'condition', to: 'loop' },
    { from: 'loop', to: 'notification' },
    { from: 'loop', to: 'rest_client' },
    { from: 'notification', to: 'end' },
  ],
  interceptors: [],
};

const doc2 = dslToFlowDocument(dsl2);
console.log('\ndsl → FlowDocument:');
console.log(`  Root nodes: ${doc2.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`);

const loopNode2 = doc2.nodes.find((n) => n.id === 'loop');
if (loopNode2 && loopNode2.blocks) {
  loopNode2.blocks.forEach((b, i) => {
    const blockNodes = (b.blocks ?? []).map((n) => `${n.id}(${n.type})`).join(', ');
    console.log(`  Loop block ${i}: [${blockNodes}]`);
  });
}

// notification 是 flow child (它后面是 end)，rest_client 是 body child
// 检查 flow child 选择是否正确
const flowChildNotification = dsl2.edges
  .filter((e) => e.from === 'loop')
  .find((e) => e.to === 'notification');
const flowChildRest = dsl2.edges
  .filter((e) => e.from === 'loop')
  .find((e) => e.to === 'rest_client');
console.log(`  Flow child 选择: notification(${flowChildNotification?.from}→${flowChildNotification?.to}), rest_client 在 body 中(${!!flowChildRest})`);

// 乱序
const doc2Reordered = [...doc2.nodes];
const endIdx2 = doc2Reordered.findIndex((n) => n.id === 'end');
const notif2Idx = doc2Reordered.findIndex((n) => n.id === 'notification');
doc2Reordered[endIdx2] = doc2.nodes[notif2Idx];
doc2Reordered[notif2Idx] = doc2.nodes[endIdx2];
console.log(`\n模拟乱序: [${doc2Reordered.map((n) => n.id).join(', ')}]`);

const result2 = simulateNotifyChange(new FlowDocumentJSON({ nodes: doc2Reordered }), dsl2);
console.log('Edges: ' + result2.edges.map((e) => `${e.from}→${e.to}`).join(', '));
checkResult('场景2 完整 notifyChange', result2, dsl2);

// ─── 场景 3: start → loop → script → end, loop → rest_client ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 3: start → loop → script → end, loop → rest_client');
console.log('='.repeat(70));

const dsl3 = {
  chain_id: 'test3',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'loop', type: 'loop', config: {} },
    { id: 'script', type: 'script', config: {} },
    { id: 'rest_client', type: 'rest_client', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'loop' },
    { from: 'loop', to: 'script' },
    { from: 'loop', to: 'rest_client' },
    { from: 'script', to: 'end' },
  ],
  interceptors: [],
};

const doc3 = dslToFlowDocument(dsl3);
console.log('\ndsl → FlowDocument:');
console.log(`  Root nodes: ${doc3.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`);

// 乱序: end 放到 script 前面
const doc3Reordered = [...doc3.nodes];
const endIdx3 = doc3Reordered.findIndex((n) => n.id === 'end');
const script3Idx = doc3Reordered.findIndex((n) => n.id === 'script');
doc3Reordered[endIdx3] = doc3.nodes[script3Idx];
doc3Reordered[script3Idx] = doc3.nodes[endIdx3];
console.log(`\n模拟乱序: [${doc3Reordered.map((n) => n.id).join(', ')}]`);

const result3 = simulateNotifyChange(new FlowDocumentJSON({ nodes: doc3Reordered }), dsl3);
console.log('Edges: ' + result3.edges.map((e) => `${e.from}→${e.to}`).join(', '));
checkResult('场景3 完整 notifyChange', result3, dsl3);

// ─── 场景 4: Fork 测试 ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 4: start → fork → [A, B] → join → end');
console.log('='.repeat(70));

const dsl4 = {
  chain_id: 'test4',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'fork', type: 'fork', config: {} },
    { id: 'script_a', type: 'script', config: {} },
    { id: 'script_b', type: 'script', config: {} },
    { id: 'join', type: 'join', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'fork' },
    { from: 'fork', to: 'script_a' },
    { from: 'fork', to: 'script_b' },
    { from: 'script_a', to: 'join' },
    { from: 'script_b', to: 'join' },
    { from: 'join', to: 'end' },
  ],
  interceptors: [],
};

const doc4 = dslToFlowDocument(dsl4);
console.log('\ndsl → FlowDocument:');
console.log(`  Root nodes: ${doc4.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`);

// Fork branch→join 是跨组边，纯 flowDocumentToDsl 无法表达。
// 在实际运行时 notifyChange 通过 edge preservation 从 prevDsl 恢复。
const result4Raw = flowDocumentToDsl(doc4, dsl4.chain_id, dsl4.version);
console.log('纯转换 edges: ' + result4Raw.edges.map((e) => `${e.from}→${e.to}`).join(', '));
console.log('  (分支→join 跨组边需要 edge preservation 恢复)');

const result4 = simulateNotifyChange(doc4, dsl4);
console.log('完整 notifyChange edges: ' + result4.edges.map((e) => `${e.from}→${e.to}`).join(', '));
checkResult('场景4 完整 notifyChange', result4, dsl4);

// ─── 场景 5: 简单线性链 ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 5: start → end (简单线性)');
console.log('='.repeat(70));

const dsl5 = {
  chain_id: 'test5',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [{ from: 'start', to: 'end' }],
  interceptors: [],
};

const doc5 = dslToFlowDocument(dsl5);
const result5 = flowDocumentToDsl(doc5, dsl5.chain_id, dsl5.version);
console.log('Round-trip edges: ' + result5.edges.map((e) => `${e.from}→${e.to}`).join(', '));
checkResult('场景5', result5, dsl5);

// ─── 场景 6: end 严格不能有出边 ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 6: end 不能有出边 (即使 FlowGram 在 end 后面放节点)');
console.log('='.repeat(70));

const mockDoc6 = new FlowDocumentJSON({
  nodes: [
    new FlowNodeJSON({ id: 'start', type: 'rule_start', data: { ruleNodeType: 'start', title: 'Start', config: {} } }),
    new FlowNodeJSON({ id: 'end', type: 'rule_end', data: { ruleNodeType: 'end', title: 'End', config: {} } }),
    new FlowNodeJSON({ id: 'extra', type: 'script', data: { ruleNodeType: 'script', title: 'Script', config: {} } }),
  ]
});

const result6 = flowDocumentToDsl(mockDoc6, 'test6', '1.0');
console.log('Edges: ' + result6.edges.map((e) => `${e.from}→${e.to}`).join(', '));
const endOut = result6.edges.filter((e) => e.from === 'end');
console.log(`  ${endOut.length === 0 ? '✓' : '✗'} end 无出边 (实际: ${endOut.length})`);
// With end-in-middle fix, start→extra (skips end), then extra→end
const hasStartToExtra = result6.edges.some((e) => e.from === 'start' && e.to === 'extra');
const hasExtraToEnd = result6.edges.some((e) => e.from === 'extra' && e.to === 'end');
console.log(`  ${hasStartToExtra && hasExtraToEnd ? '✓' : '✗'} 正确绕过 end: start→extra, extra→end`);

// ─── 场景 7: 多级容器嵌套 ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 7: loop 嵌套 loop');
console.log('='.repeat(70));

const dsl7 = {
  chain_id: 'test7',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'outer_loop', type: 'loop', config: {} },
    { id: 'inner_loop', type: 'loop', config: {} },
    { id: 'inner_notification', type: 'notification', config: {} },
    { id: 'inner_script', type: 'script', config: {} },
    { id: 'outer_notification', type: 'notification', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'outer_loop' },
    { from: 'outer_loop', to: 'outer_notification' },
    { from: 'outer_loop', to: 'inner_loop' },
    { from: 'inner_loop', to: 'inner_notification' },
    { from: 'inner_loop', to: 'inner_script' },
    { from: 'inner_script', to: 'end' },
  ],
  interceptors: [],
};

const doc7 = dslToFlowDocument(dsl7);
console.log('\ndsl → FlowDocument:');
console.log(`  Root nodes: ${doc7.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`);

const outerLoopNode = doc7.nodes.find((n) => n.id === 'outer_loop');
if (outerLoopNode && outerLoopNode.blocks) {
  outerLoopNode.blocks.forEach((b, i) => {
    const blockNodes = (b.blocks ?? []).map((n) => `${n.id}(${n.type})`).join(', ');
    console.log(`  OuterLoop block ${i}: [${blockNodes}]`);
    for (const bn of b.blocks ?? []) {
      if (bn.blocks) {
        bn.blocks.forEach((bb, j) => {
          const bbn = (bb.blocks ?? []).map((nn) => `${nn.id}(${nn.type})`).join(', ');
          console.log(`    Inner block ${j}: [${bbn}]`);
        });
      }
    }
  });
}

// 乱序
const doc7Reordered = [...doc7.nodes];
const end7Idx = doc7Reordered.findIndex((n) => n.id === 'end');
const innerScript7Idx = doc7Reordered.findIndex((n) => n.id === 'inner_script');
doc7Reordered[end7Idx] = doc7.nodes[innerScript7Idx];
doc7Reordered[innerScript7Idx] = doc7.nodes[end7Idx];
console.log(`\n模拟乱序: [${doc7Reordered.map((n) => n.id).join(', ')}]`);

const result7 = simulateNotifyChange(new FlowDocumentJSON({ nodes: doc7Reordered }), dsl7);
console.log('Edges: ' + result7.edges.map((e) => `${e.from}→${e.to}`).join(', '));
checkResult('场景7 嵌套 loop', result7, dsl7);

// ─── 场景 8: 处理未知节点（新增节点未在 prevDsl edges 中） ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 8: 新增节点（不在 prevDsl edges 中）');
console.log('='.repeat(70));

const prevDsl8 = {
  chain_id: 'test8',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'script', type: 'script', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'script' },
    { from: 'script', to: 'end' },
  ],
  interceptors: [],
};

// 用户新增了 notification 节点（在画布中，在 start 和 script 之间）
const doc8Reordered = new FlowDocumentJSON({
  nodes: [
    new FlowNodeJSON({ id: 'start', type: 'rule_start', data: { ruleNodeType: 'start', title: 'Start', config: {} } }),
    // notification 是新增的节点，不在 prevDsl edges 中
    new FlowNodeJSON({ id: 'notification', type: 'notification', data: { ruleNodeType: 'notification', title: 'Notification', config: {} } }),
    new FlowNodeJSON({ id: 'script', type: 'script', data: { ruleNodeType: 'script', title: 'Script', config: {} } }),
    new FlowNodeJSON({ id: 'end', type: 'rule_end', data: { ruleNodeType: 'end', title: 'End', config: {} } }),
  ]
});

const result8 = simulateNotifyChange(doc8Reordered, prevDsl8);
console.log('Edges: ' + result8.edges.map((e) => `${e.from}→${e.to}`).join(', '));
// 预期: start→notification, notification→script, script→end (新增节点被保留在其 FlowGram 位置)
console.log('  Nodes: ' + result8.nodes.map((n) => `${n.id}(${n.type})`).join(', '));
checkResult('场景8 新增节点', result8, {
  chain_id: 'test8',
  version: '1.0',
  nodes: [],
  edges: [
    { from: 'start', to: 'notification' },
    { from: 'notification', to: 'script' },
    { from: 'script', to: 'end' },
  ],
  interceptors: [],
});

// ─── 场景 9: 初始化后画布立即触发 notifyChange ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 9: 初始化后立即触发 (第一次 notifyChange)');
console.log('='.repeat(70));

const dsl9 = {
  chain_id: 'test9',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'condition', type: 'condition', config: {} },
    { id: 'loop', type: 'loop', config: {} },
    { id: 'notification', type: 'notification', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'condition' },
    { from: 'condition', to: 'loop' },
    { from: 'loop', to: 'notification' },
    { from: 'loop', to: 'end' },
    // loop 有两个子节点: notification(body) 和 end(flow child)
  ],
  interceptors: [],
};

const doc9 = dslToFlowDocument(dsl9);
console.log('\ndsl → FlowDocument:');
console.log(`  Root nodes: ${doc9.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`);

// 模拟第一次 notifyChange（prevDsl === initial dsl）
const result9 = simulateNotifyChange(doc9, dsl9);
console.log('\nEdges: ' + result9.edges.map((e) => `${e.from}→${e.to}`).join(', '));
console.log(`  Nodes: ${result9.nodes.map((n) => `${n.id}(${n.type})`).join(', ')}`);
checkResult('场景9 初始化', result9, dsl9);
// 特别检查: end 不能是 body child，必须是 flow child
const loop9Node = doc9.nodes.find((n) => n.id === 'loop');
if (loop9Node && loop9Node.blocks) {
  const bodyNodeIds = new Set((loop9Node.blocks[0]?.blocks ?? []).map((n) => n.id));
  if (bodyNodeIds.has('end')) {
    console.log('  ✗ 错误: end 被放在 loop body 中!');
  } else {
    console.log('  ✓ end 不在 loop body 中');
  }
}

// ─── 场景 10: 模拟增量添加 — prevDsl 有错误的 loop→end 边 ───
console.log('\n\n' + '='.repeat(70));
console.log('场景 10: 增量添加 — prevDsl 有 loop→end, 但 canvas 中 subchain 在 end 前');
console.log('  模拟用户的真实场景: 先有 loop→end, 然后在 loop 和 end 之间添加 subchain');
console.log('='.repeat(70));

// prevDsl 包含 loop→end (来自之前的步骤)
const prevDsl10 = {
  chain_id: 'test10',
  version: '1.0',
  nodes: [
    { id: 'start', type: 'start', config: {} },
    { id: 'transform_1', type: 'transform', config: {} },
    { id: 'loop_2', type: 'loop', config: {} },
    { id: 'notification_3', type: 'notification', config: {} },
    { id: 'end', type: 'end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'transform_1' },
    { from: 'transform_1', to: 'loop_2' },
    { from: 'loop_2', to: 'end' },
    { from: 'loop_2', to: 'notification_3' },
  ],
  interceptors: [],
};

// 当前 canvas: FlowGram 把 end 排在了 subchain_4 前面
// (subchain_4 是新建节点，end 被 FlowGram 内部排序到 subchain 之前)
const doc10Reordered = new FlowDocumentJSON({
  nodes: [
    new FlowNodeJSON({ id: 'start', type: 'rule_start', data: { ruleNodeType: 'start', title: 'Start', config: {} } }),
    new FlowNodeJSON({ id: 'transform_1', type: 'transform', data: { ruleNodeType: 'transform', title: 'Transform', config: {} } }),
    new FlowNodeJSON({ id: 'loop_2', type: 'loop', data: { ruleNodeType: 'loop', title: 'Loop', config: {} }, blocks: [
      new FlowNodeJSON({ id: 'loop_2__body', type: 'block', data: { ruleNodeType: '__body__', title: 'Body', config: {}, __isBranch: true }, blocks: [
        new FlowNodeJSON({ id: 'notification_3', type: 'notification', data: { ruleNodeType: 'notification', title: 'Notification', config: {} } }),
      ]}),
    ]}),
    // end 排在 subchain_4 前面 → 模拟 FlowGram 乱序
    new FlowNodeJSON({ id: 'end', type: 'rule_end', data: { ruleNodeType: 'end', title: 'End', config: {} } }),
    new FlowNodeJSON({ id: 'subchain_4', type: 'subchain', data: { ruleNodeType: 'subchain', title: 'Subchain', config: {} } }),
  ]
});

console.log('\nCanvas nodes (乱序): ' + doc10Reordered.nodes.map((n) => n.id).join(', '));
console.log('prevDsl edges: ' + prevDsl10.edges.map((e) => `${e.from}→${e.to}`).join(', '));

const result10 = simulateNotifyChange(doc10Reordered, prevDsl10);
console.log('结果 edges: ' + result10.edges.map((e) => `${e.from}→${e.to}`).join(', '));
console.log('结果 nodes: ' + result10.nodes.map((n) => `${n.id}(${n.type})`).join(', '));

checkResult('场景10 增量添加', result10, {
  chain_id: 'test10',
  version: '1.0',
  nodes: [],
  edges: [
    { from: 'start', to: 'transform_1' },
    { from: 'transform_1', to: 'loop_2' },
    { from: 'loop_2', to: 'subchain_4' },
    { from: 'subchain_4', to: 'end' },
    { from: 'loop_2', to: 'notification_3' },
  ],
  interceptors: [],
});

// ══════════════════════════════════════════════════════════════════
//  总结
// ══════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(70)}`);
console.log(`通过: ${passCount}  |  失败: ${failCount}`);
console.log(`${'='.repeat(70)}`);
if (failCount > 0) {
  console.log('\n❌ 有测试失败!');
  process.exit(1);
} else {
  console.log('\n✅ 所有场景自测通过!');
}
