import type { FlowDocumentJSON, FlowNodeJSON } from '@flowgram.ai/fixed-layout-editor';
import type { RuleChainDsl, RuleNode, RuleEdge } from '../../../types/rule';
import type { RuleNodeType } from './nodes/types';
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
 *
 * In FlowGram's fixed-layout, a linear chain is a flat array of sibling nodes
 * (connection lines are drawn automatically between consecutive siblings).
 * Blocks are only used for branching (fork → multiple branches → join).
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

  // Add any unvisited nodes in DSL order (preserves linear chain sequence)
  for (const node of dsl.nodes) {
    if (!visited.has(node.id)) {
      const flowNode = walkDslNode(node.id, nodeMap, adjacency, visited);
      if (flowNode) flowNodes.push(flowNode);
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

  const ruleNodeType = dslNode.type as RuleNodeType;
  const title = NODE_LABELS[ruleNodeType] ?? dslNode.type;
  const children = adjacency.get(nodeId) ?? [];

  // Fork nodes with multiple children → dynamicSplit with branch blocks
  const isFork = ruleNodeType === 'fork' && children.length > 1;
  const flowType = isFork ? 'dynamicSplit' : toFlowGramType(ruleNodeType);

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

  if (isFork) {
    flowNode.blocks = children.map((childId, idx) => {
      const blockId = `${dslNode.id}_branch_${idx}`;
      const branchChildren: FlowNodeJSON[] = [];
      let current = childId;
      while (current) {
        const childNode = walkDslNode(current, nodeMap, adjacency, visited);
        if (childNode) branchChildren.push(childNode);
        const currentNode = nodeMap.get(current);
        if (currentNode && currentNode.type === 'join') break;
        const nextChildren = adjacency.get(current);
        current = nextChildren && nextChildren.length === 1 ? nextChildren[0] : '';
      }
      return {
        id: blockId,
        type: 'block' as const,
        data: {
          ruleNodeType: '__branch__',
          title: `Branch ${idx + 1}`,
          config: {},
          __isBranch: true,
          branchIndex: idx,
        } satisfies FlowNodeData,
        blocks: branchChildren.length > 0 ? branchChildren : undefined,
      };
    });
  }

  // Linear chain nodes: children become siblings (visited separately above),
  // so we do NOT nest them in blocks.
  return flowNode;
}

// ─── FlowDocument → DSL ────────────────────────────────────────

/**
 * Convert FlowGram's FlowDocumentJSON back to our flat DSL nodes+edges format.
 *
 * FlowGram stores nodes in a flat array for linear chains (consecutive siblings
 * are implicitly connected). For branching (fork/dynamicSplit), nodes are nested
 * inside block containers.
 *
 * This function:
 *  1. Walks the FlowGram tree in order, collecting real (non-branch) nodes
 *  2. Tracks each node's "group" — root-level siblings share '__root__';
 *     each dynamicSplit branch creates its own group
 *  3. Generates edges between consecutive nodes IN THE SAME GROUP
 *  4. Generates owner→first-child edges for branch groups (fork → branch[0])
 *
 * This correctly handles loop child chains (all siblings at root level),
 * fork branches (separate groups prevent cross-branch edges), and
 * mixed linear + branch flows.
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

  /** Walk the FlowNode tree collecting nodes and tracking group membership. */
  function walk(node: FlowNodeJSON, group: string, owner?: string): void {
    if (!node || !node.id) return;
    const data = node.data as FlowNodeData | undefined;

    if (!data?.__isBranch) {
      // This is a real (non-branch) node — add to output
      const rawConfig: Record<string, unknown> = data?.config ?? {};
      // Strip __-prefixed internal metadata from config (internal markers)
      const cleanConfig: Record<string, unknown> = {};
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
    for (const block of blocks) {
      if (data?.__isBranch) {
        // (1) This node IS a branch wrapper — children stay in the SAME group.
        //     FlowGram inlines the children directly (no wrapping block).
        for (const child of block.blocks ?? []) {
          walk(child, group, owner);
        }
      } else if (block.data?.__isBranch || block.type === 'block') {
        // (2) Block is a branch wrapper inside an owner (e.g. fork/dynamicSplit).
        //     Each branch wrapper's children form a NEW group with the owner
        //     connecting to the first child.
        for (const child of block.blocks ?? []) {
          walk(child, block.id, node.id);
        }
      } else {
        // (3) Block is a direct child node — walk it immediately.
        //     This handles cases where FlowGram's toJSON() nests children
        //     inside a non-fork node's blocks (e.g., loop's children are
        //     placed in loop's blocks by toJSON due to FlowGram's entity tree).
        walk(block, group, node.id);
      }
    }
  }

  for (const rootNode of json.nodes ?? []) {
    walk(rootNode, '__root__');
  }

  // Generate edges between consecutive nodes within each group.
  // Branch groups also get an owner→first-child edge.
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

  return {
    chain_id: chainId,
    version,
    nodes,
    edges,
    interceptors: [],
  };
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
 * Create a new DSL node JSON for insertion into the canvas.
 */
export function createNodeJson(
  type: RuleNodeType,
  id?: string,
): { id: string; config: Record<string, unknown> } {
  return {
    id: id ?? `${type}_${generateShortId()}`,
    config: getDefaultConfig(type),
  };
}

function getDefaultConfig(type: RuleNodeType): Record<string, unknown> {
  const defaults: Partial<Record<RuleNodeType, Record<string, unknown>>> = {
    condition: { expression: 'true' },
    transform: { field_map: {} },
    assign: { variables: {} },
    delay: { duration_ms: 1000 },
    log: { level: 'info', message: '' },
    script: { script: '// Rhai script\nlet result = input;\nresult' },
    rest_client: { method: 'POST', url: 'https://example.com/api', timeout_ms: 10000 },
    notification: { webhook_url: '', template: '' },
    subchain: { subchain_id: '', pass_context: true },
    fork: { join_at: '' },
    join: { merge_strategy: 'merge' },
    loop: { iterator_source: '', loop_var: 'item', max_iterations: 1000 },
  };
  return defaults[type] ?? {};
}

function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}
