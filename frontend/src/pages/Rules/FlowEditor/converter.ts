import type { FlowDocumentJSON, FlowNodeJSON } from '@flowgram.ai/fixed-layout-editor';
import type { RuleChainDsl, RuleNode, RuleEdge } from '../../../types/rule';
import { NODE_LABELS, toFlowGramType } from './nodes/types';

/** A FlowGram node's data shape stored alongside the canvas representation. */
interface FlowNodeData {
  ruleNodeType: string;
  title: string;
  config: Record<string, unknown>;
  /** Internal marker for branch wrapper blocks (not real DSL nodes). */
  __isBranch?: boolean;
  branchIndex?: number;
}

// ─── DSL → FlowDocument ────────────────────────────────────────

/**
 * Convert a flat DSL nodes+edges structure into FlowGram's FlowDocumentJSON.
 */
export function dslToFlowDocument(dsl: RuleChainDsl): FlowDocumentJSON {
  const adjacency = buildAdjacency(dsl.edges);
  const backwards = buildReverseAdjacency(dsl.edges);
  const nodeMap = new Map(dsl.nodes.map((n) => [n.id, n]));

  // Root nodes are those with no incoming edges
  const rootIds = dsl.nodes
    .filter((n) => !backwards.has(n.id) || backwards.get(n.id)!.length === 0)
    .map((n) => n.id);

  if (rootIds.length === 0 && dsl.nodes.length > 0) {
    rootIds.push(dsl.nodes[0].id);
  }

  const visited = new Set<string>();
  const flowNodes: FlowNodeJSON[] = [];

  for (const rootId of rootIds) {
    const flowNode = walkDslNode(rootId, nodeMap, adjacency, visited);
    if (flowNode) flowNodes.push(flowNode);
  }

  // Process remaining unvisited nodes in topological order
  {
    const unvisitedIds = new Set(
      dsl.nodes.filter((n) => !visited.has(n.id)).map((n) => n.id),
    );

    if (unvisitedIds.size > 0) {
      const fwd = new Map<string, string[]>();
      const rev = new Map<string, string[]>();
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
        const id = queue.shift()!;
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

  return { nodes: flowNodes };
}

function walkDslNode(
  nodeId: string,
  nodeMap: Map<string, RuleNode>,
  adjacency: Map<string, string[]>,
  visited: Set<string>,
): FlowNodeJSON | null {
  if (visited.has(nodeId)) return null;
  const dslNode = nodeMap.get(nodeId);
  if (!dslNode) return null;
  visited.add(nodeId);

  const ruleNodeType = dslNode.type;
  const title = NODE_LABELS[ruleNodeType] ?? dslNode.type;
  const children = adjacency.get(nodeId) ?? [];

  // Determine FlowGram structural type based on ruleNodeType
  const isDynamicSplit = (ruleNodeType === 'fork' || ruleNodeType === 'switch') && children.length > 0;
  const isStaticSplit = (ruleNodeType === 'if' || ruleNodeType === 'try_catch') && children.length > 0;
  const isContainer = (ruleNodeType === 'loop' || ruleNodeType === 'subchain') && children.length > 1;

  let flowType: string;
  if (isDynamicSplit) {
    flowType = 'dynamicSplit';
  } else if (isStaticSplit) {
    flowType = 'staticSplit';
  } else {
    flowType = toFlowGramType(ruleNodeType);
  }

  const nodeData: FlowNodeData = {
    ruleNodeType,
    title,
    config: { ...(dslNode.config ?? {}) },
  };

  const flowNode: FlowNodeJSON = {
    id: dslNode.id,
    type: flowType,
    data: nodeData,
  };

  // ── Dynamic split (fork / switch) ─────────────────────────────
  if (isDynamicSplit) {
    // Read branch conditions from switch config (new format with inline branches)
    const switchBranches = ruleNodeType === 'switch'
      ? (dslNode.config?.branches ?? []) as Array<{ condition?: string; start_id: string; end_id: string }>
      : [];
    const conditionByStartId = new Map<string, string>();
    for (const b of switchBranches) {
      if (b.start_id) conditionByStartId.set(b.start_id, b.condition ?? '');
    }

    flowNode.blocks = children.map((childId, idx) => {
      const blockId = `${dslNode.id}_branch_${idx}`;
      const branchChildren: FlowNodeJSON[] = [];
      let current = childId;
      let maxDepth = 200;
      while (current && maxDepth-- > 0) {
        const currentNode = nodeMap.get(current);
        if (!currentNode) break;
        // Stop at join (for fork) or at the next root-level node
        if (currentNode.type === 'join') break;
        // Skip case nodes — they're now inline in the switch config
        if (currentNode.type !== 'case' && currentNode.type !== 'case_default') {
          const childNode = walkDslNode(current, nodeMap, adjacency, visited);
          if (childNode) branchChildren.push(childNode);
        }
        const nextChildren = adjacency.get(current);
        current = nextChildren && nextChildren.length === 1 ? nextChildren[0] : '';
      }
      // IMPORTANT: Do NOT set type on branch blocks! Let FlowGram's
      // addInlineBlocks auto-create the blockIcon/inlineBlocks wrapper
      // nodes that the layout engine needs to render hidden block children.
      const isDefault = idx === children.length - 1;
      const branchRuleType = ruleNodeType === 'switch'
        ? (isDefault ? 'case_default' : 'case')
        : '__branch__';

      // Read condition: first try new format (from switch config branches),
      // then fall back to old format (read from the case node in the DSL)
      let condition = conditionByStartId.get(childId) ?? '';
      if (condition === '' && ruleNodeType === 'switch') {
        // Old format: childId points to a case node, read condition from it
        const caseNode = nodeMap.get(childId);
        if (caseNode && (caseNode.type === 'case' || caseNode.type === 'case_default')) {
          condition = (caseNode.config as any)?.condition ?? '';
          // In old format, the real action nodes are children of the case node
          // Walk past the case node to find action nodes
          if (branchChildren.length === 0) {
            const caseChildren = adjacency.get(childId) ?? [];
            let walkCurrent = caseChildren.length === 1 ? caseChildren[0] : '';
            while (walkCurrent && maxDepth-- > 0) {
              const walkNode = nodeMap.get(walkCurrent);
              if (!walkNode) break;
              if (walkNode.type === 'join') break;
              const childNode = walkDslNode(walkCurrent, nodeMap, adjacency, visited);
              if (childNode) branchChildren.push(childNode);
              const next = adjacency.get(walkCurrent);
              walkCurrent = next && next.length === 1 ? next[0] : '';
            }
          }
        }
      }

      return {
        id: blockId,
        data: {
          ruleNodeType: branchRuleType,
          title: ruleNodeType === 'switch'
            ? (isDefault ? '默认' : `Case ${idx + 1}`)
            : `Branch ${idx + 1}`,
          config: ruleNodeType === 'switch' && !isDefault
            ? { condition }
            : {},
          __isBranch: true,
          branchIndex: idx,
        } satisfies FlowNodeData,
        blocks: branchChildren.length > 0 ? branchChildren : undefined,
      };
    });
  }

  // ── Static split (if / try_catch) ─────────────────────────────
  if (isStaticSplit) {
    const blockNames: Record<string, string[]> = {
      if: ['True', 'False'],
      try_catch: ['Try', 'Catch'],
    };
    const names = blockNames[ruleNodeType] ?? ['Branch 1', 'Branch 2'];

    flowNode.blocks = children.map((childId, idx) => {
      const blockId = `${dslNode.id}_${names[idx].toLowerCase()}`;
      const branchChildren: FlowNodeJSON[] = [];
      let current = childId;
      let maxDepth = 200;
      while (current && maxDepth-- > 0) {
        const currentNode = nodeMap.get(current);
        if (!currentNode) break;
        // Stop at end — it should remain a root-level node
        if (currentNode.type === 'end') break;
        const n = walkDslNode(current, nodeMap, adjacency, visited);
        if (n) branchChildren.push(n);
        const next = adjacency.get(current);
        current = next && next.length === 1 ? next[0] : '';
      }
      // IMPORTANT: Do NOT set type on branch blocks! FlowGram needs
      // to use addInlineBlocks to create proper inline structure.
      return {
        id: blockId,
        data: {
          ruleNodeType: ruleNodeType === 'if' ? 'if_block' : ruleNodeType === 'try_catch' ? (idx === 0 ? 'try_block' : 'catch_block') : '__branch__',
          title: names[idx],
          config: dslNode.config ?? {},
          __isBranch: true,
        } satisfies FlowNodeData,
        blocks: branchChildren.length > 0 ? branchChildren : undefined,
      };
    });
  }

  // ── Container body blocks (loop / subchain) ───────────────────
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
      const bodyNodes: FlowNodeJSON[] = [];
      for (const childId of bodyChildren) {
        let current = childId;
        let maxDepth = 200;
        while (current && maxDepth-- > 0) {
          const n = walkDslNode(current, nodeMap, adjacency, visited);
          if (n) bodyNodes.push(n);
          const next = adjacency.get(current);
          current = next && next.length === 1 ? next[0] : '';
        }
      }
      // IMPORTANT: Do NOT set type on body blocks! FlowGram needs
      // to use addInlineBlocks to create proper inline structure.
      flowNode.blocks = [
        {
          id: `${dslNode.id}__body`,
          data: {
            ruleNodeType: '__body__',
            title: 'Body',
            config: {},
            __isBranch: true,
          } satisfies FlowNodeData,
          blocks: bodyNodes.length > 0 ? bodyNodes : undefined,
        },
      ];
    }
  }

  return flowNode;
}

// ─── FlowDocument → DSL ────────────────────────────────────────

/**
 * Convert FlowGram's FlowDocumentJSON back to our flat DSL nodes+edges format.
 */
export function flowDocumentToDsl(
  json: FlowDocumentJSON,
  chainId = '',
  version = '1.0',
): RuleChainDsl {
  const nodes: RuleNode[] = [];
  const edges: RuleEdge[] = [];

  // groupId → ordered node IDs within that group
  const groups = new Map<string, string[]>();
  // groupId → owner node ID (parent that connects to the group's first child)
  const owners = new Map<string, string>();

  // Branch conditions extracted from case/case_default UI markers.
  // Key: branch block ID (same as group ID), Value: condition string.
  const branchConditions = new Map<string, string>();

  /** Walk the FlowNode tree collecting nodes and tracking group membership. */
  function walk(node: FlowNodeJSON, group: string, owner?: string): void {
    if (!node || !node.id) return;
    const data = node.data as FlowNodeData | undefined;

    // Determine the DSL type: use ruleNodeType if available, fall back to flowGramType
    const dslType = data?.ruleNodeType ?? toDslType(String(node.type ?? 'default'));

    // Skip UI-only marker nodes (case, case_default) — their conditions
    // are stored in the switch config's branches array instead.
    if (dslType === 'case' || dslType === 'case_default') {
      // Store condition for this branch (keyed by group = branch block ID)
      if (data?.config) {
        const condition = (data.config as Record<string, unknown>).condition ?? '';
        branchConditions.set(group, String(condition));
      }
      // Process any children (case nodes are typically leaves, but handle gracefully)
      for (const block of node.blocks ?? []) {
        walk(block, group, owner);
      }
      return;
    }

    if (!data?.__isBranch) {
      const rawConfig: Record<string, unknown> = data?.config ?? {};
      const cleanConfig: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawConfig)) {
        if (!k.startsWith('__')) cleanConfig[k] = v;
      }

      nodes.push({
        id: node.id,
        type: dslType,
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
        // This node IS a branch wrapper — children stay in SAME group
        for (const child of block.blocks ?? []) {
          walk(child, group, owner);
        }
      } else if (block.data?.__isBranch || block.type === 'block') {
        // Block is a branch wrapper inside an owner.
        // Extract condition from case/case_default branch blocks for switch nodes.
        const blockData = block.data as FlowNodeData | undefined;
        const blockRuleType = blockData?.ruleNodeType;
        if ((blockRuleType === 'case' || blockRuleType === 'case_default') && blockData?.config) {
          const condition = String((blockData.config as Record<string, unknown>).condition ?? '');
          branchConditions.set(block.id, condition);
        }
        for (const child of block.blocks ?? []) {
          walk(child, block.id, node.id);
        }
      } else {
        // Direct child node — sub-group
        walk(block, `${node.id}__children`, node.id);
      }
    }
  }

  for (const rootNode of json.nodes ?? []) {
    walk(rootNode, '__root__');
  }

  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type]));

  // Generate edges between consecutive nodes within each group
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i];
      const b = ids[i + 1];
      if (nodeTypeMap.get(a) === 'end') continue;
      // Skip fork→join (handled by owner→first-child)
      if (nodeTypeMap.get(a) === 'fork' && nodeTypeMap.get(b) === 'join') continue;
      edges.push({ from: a, to: b });
      // Nothing should route past end — stop generating edges within this group
      if (nodeTypeMap.get(b) === 'end') break;
    }
  }

  // Owner → first-child-of-branch edges (for dynamicSplit/staticSplit)
  for (const [gid, ids] of groups) {
    if (gid === '__root__') continue;
    const ownerId = owners.get(gid);
    if (ownerId && ids.length > 0) {
      edges.push({ from: ownerId, to: ids[0] });
    }
  }

  // Generate "branch-tail → next-root" edges for container nodes
  // with branch blocks.  When a dynamicSplit (fork/switch) or staticSplit
  // (if/try_catch) has branch blocks, each branch's last child connects
  // to whatever node follows the container in the root-level group
  // (e.g. join for fork/switch, end for if/try_catch).
  const rootIds = groups.get('__root__') ?? [];
  const ctypeMap = new Map(nodes.map((n) => [n.id, n.type]));
  const branchContainers = new Set(['fork', 'switch', 'if', 'try_catch']);

  for (let ri = 0; ri < rootIds.length; ri++) {
    const containerId = rootIds[ri];
    if (!branchContainers.has(ctypeMap.get(containerId) ?? '')) continue;
    const nextRootId = ri + 1 < rootIds.length ? rootIds[ri + 1] : undefined;
    if (!nextRootId) continue;

    // Check if this container actually owns branch groups.
    // If it has no branches (e.g. an if/try_catch node in linear mode
    // without branch blocks), it should NOT have its edges rewritten.
    const ownedGroups: string[][] = [];
    for (const [gid, ids] of groups) {
      if (owners.get(gid) === containerId && ids.length > 0) {
        ownedGroups.push(ids);
      }
    }
    if (ownedGroups.length === 0) continue;

    // Remove any direct container→nextRoot edge (routing is via branches)
    const filtered: RuleEdge[] = [];
    for (const e of edges) {
      if (!(e.from === containerId && e.to === nextRootId)) {
        filtered.push(e);
      }
    }
    edges.length = 0;
    edges.push(...filtered);

    // Add branch-tail → nextRoot for each branch group owned by container
    for (const ids of ownedGroups) {
      edges.push({ from: ids[ids.length - 1], to: nextRootId });
    }
  }

  // Rebuild outgoing map after edge modifications
  enrichNodeConfigs(nodes, edges, groups, owners, branchConditions);

  return {
    chain_id: chainId,
    version,
    nodes,
    edges,
    interceptors: [],
  };
}

/** Map FlowGram structural types back to DSL types. */
function toDslType(flowGramType: string): string {
  const mapping: Record<string, string> = {
    'dynamicSplit': 'fork',
    'staticSplit': 'if',
  };
  return mapping[flowGramType] ?? (flowGramType.startsWith('rule_') ? flowGramType.slice(5) : flowGramType);
}

/** Enrich node configs with structural info derived from the edge graph. */
function enrichNodeConfigs(
  nodes: RuleNode[],
  edges: RuleEdge[],
  groups: Map<string, string[]>,
  owners: Map<string, string>,
  branchConditions: Map<string, string>,
): void {
  const outgoingEdges = new Map<string, string[]>();
  for (const e of edges) {
    const list = outgoingEdges.get(e.from) ?? [];
    list.push(e.to);
    outgoingEdges.set(e.from, list);
  }

  for (const node of nodes) {
    if (node.type === 'condition') {
      const out = outgoingEdges.get(node.id) ?? [];
      if (out.length >= 1) node.config.true_branch = out[0];
      if (out.length >= 2) node.config.false_branch = out[1];
    }

    if (node.type === 'if') {
      const out = outgoingEdges.get(node.id) ?? [];
      if (out.length >= 1) node.config.true_branch = out[0];
      if (out.length >= 2) node.config.false_branch = out[1];
    }

    if (node.type === 'loop') {
      const out = outgoingEdges.get(node.id) ?? [];
      // Distinguish body-start edges (owner→child into a branch group)
      // from flow-out edges (consecutive sibling in the same parent group).
      let bodyStart: string | undefined;
      let flowStart: string | undefined;

      for (const target of out) {
        let isOwned = false;
        for (const [gid] of groups) {
          if (owners.get(gid) === node.id) {
            const childIds = groups.get(gid) ?? [];
            if (childIds.includes(target)) {
              isOwned = true;
              break;
            }
          }
        }
        if (isOwned) {
          bodyStart = target;
        } else {
          flowStart = target;
        }
      }

      if (bodyStart) {
        node.config.body_start_id = bodyStart;
      }

      if (flowStart) {
        let walk = flowStart;
        for (let i = 0; i < 100; i++) {
          const nextOut = outgoingEdges.get(walk) ?? [];
          if (nextOut.length === 0) break;
          walk = nextOut[0];
        }
        if (walk && walk !== flowStart) {
          node.config.flow_out_id = walk;
        }
      }
    }

    if (node.type === 'fork') {
      const segments: { start_id: string; end_id: string }[] = [];
      for (const [gid, ids] of groups) {
        if (owners.get(gid) === node.id && ids.length > 0) {
          const lastNodeId = ids[ids.length - 1];
          const lastOut = outgoingEdges.get(lastNodeId) ?? [];
          const endId = lastOut[0] ?? '';
          segments.push({ start_id: ids[0], end_id: endId });
        }
      }
      if (segments.length > 0) {
        node.config.segments = segments;
      }
    }

    if (node.type === 'switch') {
      const branches: { condition: string; start_id: string; end_id: string }[] = [];
      for (const [gid, ids] of groups) {
        if (owners.get(gid) === node.id && ids.length > 0) {
          const lastNodeId = ids[ids.length - 1];
          const lastOut = outgoingEdges.get(lastNodeId) ?? [];
          const endId = lastOut[0] ?? '';
          const condition = branchConditions.get(gid) ?? '';
          branches.push({ condition, start_id: ids[0], end_id: endId });
        }
      }
      if (branches.length > 0) {
        node.config.branches = branches;
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function buildAdjacency(edges: RuleEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.from) ?? [];
    list.push(e.to);
    map.set(e.from, list);
  }
  return map;
}

function buildReverseAdjacency(edges: RuleEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.to) ?? [];
    list.push(e.from);
    map.set(e.to, list);
  }
  return map;
}

/**
 * Create a default DSL with start and end nodes.
 */
export function createDefaultDsl(): RuleChainDsl {
  const id = generateShortId();
  return {
    chain_id: id,
    version: '1.0',
    nodes: [
      { id: 'start', type: 'start', config: {} },
      { id: 'end', type: 'end', config: {} },
    ],
    edges: [{ from: 'start', to: 'end' }],
    interceptors: [],
  };
}

/**
 * Create a new DSL node JSON for insertion.
 */
export function createNodeJson(
  type: string,
  id?: string,
): { id: string; config: Record<string, unknown> } {
  return {
    id: id ?? `${type}_${generateShortId()}`,
    config: getDefaultConfig(type),
  };
}

function getDefaultConfig(type: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    condition: { expression: 'true' },
    transform: { field_map: {} },
    assign: { variables: {} },
    delay: { duration_ms: 1000 },
    log: { level: 'info', message: '' },
    script: { script: '// Rhai script\nlet result = input;\nresult' },
    rest_client: { method: 'POST', url: '', timeout_ms: 10000 },
    notification: { webhook_url: '', template: '' },
    subchain: { subchain_id: '', pass_context: true },
    fork: { join_at: '', segments: [] },
    join: { merge_strategy: 'merge' },
    loop: { iterator_source: '', loop_var: 'item', max_iterations: 1000 },
    llm: { model: '', prompt: '', temperature: 0.7, max_tokens: 1024 },
    switch: { branches: [] },
    if: { expression: 'true' },
    try_catch: {},
    break_loop: {},
  };
  return defaults[type] ?? {};
}

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}
