import { useCallback, useRef, useMemo, useContext, useEffect } from 'react';
import {
  FixedLayoutEditorProvider,
  EditorRenderer,
  usePlaygroundTools,
  usePlayground,
  type FixedLayoutPluginContext,
  type FlowNodeJSON,
  type FlowNodeType,
  FlowRendererKey,
  FlowNodeBaseType,
} from '@flowgram.ai/fixed-layout-editor';
import type { FlowDocumentJSON } from '@flowgram.ai/fixed-layout-editor';
import { defaultFixedSemiMaterials } from '@flowgram.ai/fixed-semi-materials';
import { Tooltip } from '@douyinfe/semi-ui';
import type { RuleChainDsl, RuleEdge } from '../../../types/rule';
import { buildRegistries, NODE_CATEGORIES, NODE_LABELS, NODE_COLORS } from './nodes';
import { dslToFlowDocument, flowDocumentToDsl } from './converter';
import { NotifyContext } from './context';
import NodeAdder from './NodeAdder';
import BranchAdder from './BranchAdder';
import DefaultRuleNode from './DefaultRuleNode';
import CustomCollapse from './Collapse';
import NodeConfigPanel from './NodeConfigPanel';
import { NodeSelectionContext } from './nodeSelection';

/** Walk FlowGram's tree and collect all real (non-branch) node IDs. */
function collectCanvasNodeIds(nodes: FlowNodeJSON[]): Set<string> {
  const ids = new Set<string>();
  function walk(list: FlowNodeJSON[]): void {
    for (const n of list) {
      if (n.id && !(n.data as Record<string, unknown> | undefined)?.__isBranch) {
        ids.add(n.id);
      }
      walk(n.blocks ?? []);
    }
  }
  walk(nodes);
  return ids;
}

/**
 * Reorder root-level FlowGram nodes by DSL edge topology.
 * FlowGram's internal node order can differ from the chain order
 * defined by edges (e.g. 'end' before 'subchain'), causing
 * flowDocumentToDsl to generate wrong consecutive edges.
 * This DFS-based topological sort ensures root-level nodes are
 * in the correct chain order before conversion.
 *
 * Nodes NOT present in the edge graph (e.g. newly added nodes that
 * haven't been saved to prevDsl yet) are preserved at their original
 * FlowGram positions relative to the topological-sorted nodes.
 */
function reorderByTopology(
  nodes: FlowNodeJSON[],
  edges: RuleEdge[],
): FlowNodeJSON[] {
  if (edges.length === 0) return nodes;

  const adj = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
    if (!rev.has(e.to)) rev.set(e.to, []);
    rev.get(e.to)!.push(e.from);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const visited = new Set<string>();
  const sorted: FlowNodeJSON[] = [];

  function dfs(id: string): void {
    if (visited.has(id) || !nodeIds.has(id)) return;
    visited.add(id);
    const n = nodeMap.get(id);
    if (n) sorted.push(n);
    for (const next of adj.get(id) ?? []) dfs(next);
  }

  // Collect the set of nodes that appear in the edge graph (prevDsl edges).
  // Only these nodes participate in topological sorting — nodes not in the
  // edge graph (e.g. newly added nodes with no prevDsl edges yet) are
  // handled separately and preserve their original FlowGram position.
  const edgeNodeIds = new Set<string>();
  for (const e of edges) { edgeNodeIds.add(e.from); edgeNodeIds.add(e.to); }

  // DFS from root nodes that are part of the edge graph
  for (const n of nodes) {
    if (edgeNodeIds.has(n.id) && !rev.has(n.id)) dfs(n.id);
  }

  // IMPORTANT: Do NOT add stragglers (nodes not reached by DFS) to sorted.
  // They will be handled by the merge below as "unknown" nodes, preserving
  // their original FlowGram positions.  Adding them to sorted would cause
  // them to be placed at the end instead.

  // Merge: iterate the original FlowGram order, emitting sorted nodes
  // in DFS order while interspersing unknown (new) nodes at their
  // original positions.
  const sortedIds = new Set(sorted.map((n) => n.id));
  const result: FlowNodeJSON[] = [];
  let si = 0; // sorted index

  for (const n of nodes) {
    if (sortedIds.has(n.id)) {
      // Find where this node appears in the sorted list (at or after si)
      const idx = sorted.findIndex((s, i) => i >= si && s.id === n.id);
      if (idx >= 0) {
        // Emit any skipped sorted nodes up to this position
        for (; si < idx; si++) result.push(sorted[si]);
        // Emit this node
        if (si < sorted.length && sorted[si].id === n.id) {
          result.push(sorted[si]);
          si++;
        }
      }
      // If not found in remaining sorted, it was already emitted
      // as part of a catch-up — skip silently (no duplicate)
    } else {
      // Unknown node — preserve FlowGram's relative position
      result.push(n);
    }
  }

  // Append any remaining sorted nodes
  for (; si < sorted.length; si++) result.push(sorted[si]);

  return result;
}

interface Props {
  dsl: RuleChainDsl;
  onChange: (dsl: RuleChainDsl) => void;
  readonly?: boolean;
  /** JSON view mode — when true, render a JSON textarea instead of the canvas */
  viewMode?: 'visual' | 'json';
  /** Called when the user clicks the view-mode toggle in the toolbar */
  onViewModeSwitch?: (mode: 'visual' | 'json') => void;
}

export default function FlowEditor({ dsl, onChange, readonly = false, viewMode, onViewModeSwitch }: Props) {
  const editorRef = useRef<FixedLayoutPluginContext>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const dslRef = useRef(dsl);
  dslRef.current = dsl;

  const initialData = useMemo(() => dslToFlowDocument(dsl), [dsl]);

  const registries = useMemo(() => buildRegistries(), []);

  const getDefaultRegistry = useCallback(
    (type: FlowNodeType) => {
      const existing = registries.find((r) => r.type === String(type));
      if (existing) return existing as never;
      return {
        type,
        meta: { defaultExpanded: true },
      };
    },
    [registries],
  );

  // Latest canvas DSL snapshot — updated by notifyChange and used in JSON mode.
  // This ensures the JSON textarea always reflects the actual canvas state,
  // independent of the dsl prop (which can be stale).
  const canvasDslRef = useRef(dsl);

  const notifyChange = useCallback(() => {
    const ctx = editorRef.current;
    if (!ctx || ctx.document.disposed) return;
    try {
      const docJson: FlowDocumentJSON = ctx.document.toJSON();
      const prevDsl = dslRef.current;

      // Reorder root-level nodes by DSL edge topology before converting.
      // FlowGram's internal node order can differ from the chain order
      // defined by edges (e.g. 'end' might appear before 'subchain' in
      // the node list even though subchain→end), causing flowDocumentToDsl
      // to generate wrong consecutive edges (loop→end instead of
      // loop→subchain→end).  This reorder fixes that.
      docJson.nodes = reorderByTopology(docJson.nodes ?? [], prevDsl.edges);

      const newDsl = flowDocumentToDsl(docJson, prevDsl.chain_id, prevDsl.version);

      // Collect all node IDs present in the live canvas (docJson).
      // If a node is in the canvas but the converter missed it, we restore it
      // from prevDsl. This guards against converter bugs or timing issues where
      // a node was added to the canvas but not yet reflected in toJSON()/converter.
      const canvasIds = collectCanvasNodeIds((docJson as FlowDocumentJSON).nodes ?? []);
      const prevNodeMap = new Map(prevDsl.nodes.map((n) => [n.id, n]));
      const newNodeIds = new Set(newDsl.nodes.map((n) => n.id));

      for (const id of canvasIds) {
        if (!newNodeIds.has(id) && prevNodeMap.has(id)) {
          newDsl.nodes.push(prevNodeMap.get(id)!);
          newNodeIds.add(id);
        }
      }

      // Preserve edges that flat sibling ordering cannot represent
      // (e.g. loop→end as a second outgoing edge, rest_client→loop as a back-edge).
      // The converter generates edges between consecutive siblings within each group,
      // which loses multi-target and back-edges. We restore them from the previous
      // DSL state, but ONLY when the edge involves a container type (loop, fork,
      // subchain) — these are the cases the converter fundamentally cannot express.
      // Without this guard, stale edges from prevDsl accumulate indefinitely and
      // cannot be removed through canvas operations.
      const CONTAINER_TYPES = new Set(['loop', 'fork', 'subchain', 'switch', 'if', 'try_catch']);
      const newNodeMap = new Map(newDsl.nodes.map((n) => [n.id, n]));
      const nodeIds = new Set(newDsl.nodes.map((n) => n.id));
      const newEdgeKeys = new Set(newDsl.edges.map((e) => `${e.from}→${e.to}`));

      // Build outgoing-edge map from newDsl to detect stale prevDsl edges.
      // If a source already has a successor in newDsl, edges from prevDsl
      // that target a non-container non-join node are likely stale
      // (e.g. loop→end was correct when end was the only successor, but
      // becomes stale when a new node like subchain is inserted between them).
      const newDslOutgoing = new Map<string, string[]>();
      for (const e of newDsl.edges) {
        const list = newDslOutgoing.get(e.from) ?? [];
        list.push(e.to);
        newDslOutgoing.set(e.from, list);
      }

      for (const e of prevDsl.edges) {
        const key = `${e.from}→${e.to}`;
        if (nodeIds.has(e.from) && nodeIds.has(e.to) && !newEdgeKeys.has(key)) {
          // Only restore edges where a container node is involved — these
          // represent multi-outgoing (loop→child + loop→end) or back-edge
          // patterns (inside_container → container_parent).
          // Also restore edges targeting 'join' — fork branch last-nodes
          // connect to join via cross-group edges the converter cannot express.
          const srcType = newNodeMap.get(e.from)?.type ?? '';
          const tgtType = newNodeMap.get(e.to)?.type ?? '';
          // end is terminal — never restore outgoing edges from it
          if (srcType === 'end') continue;

          // Stale edge detection: if the source already has outgoing edges
          // in newDsl, and the target is NOT a container or join, this edge
          // was likely a previous consecutive connection that is now stale
          // (e.g. loop→end when subchain was inserted between them).
          const existingTargets = newDslOutgoing.get(e.from);
          if (existingTargets && existingTargets.length > 0) {
            if (!CONTAINER_TYPES.has(tgtType) && tgtType !== 'join') {
              continue; // stale — skip restoration
            }
          }

          if (CONTAINER_TYPES.has(srcType) || CONTAINER_TYPES.has(tgtType) || tgtType === 'join') {
            newDsl.edges.push(e);
            newEdgeKeys.add(key);
          }
        }
      }

      canvasDslRef.current = newDsl;
      onChangeRef.current(newDsl);
    } catch {
      // Ignore conversion errors
    }
  }, []);

  const handleAllLayersRendered = useCallback(
    (ctx: FixedLayoutPluginContext) => {
      ctx.document.onNodeCreate(() => notifyChange());
      ctx.document.onNodeDispose(() => notifyChange());
      ctx.document.onNodeUpdate(() => notifyChange());
      setTimeout(() => {
        ctx.tools.fitView();
      }, 10);
    },
    [notifyChange],
  );

  // Capture canvas state BEFORE switching away from visual mode.
  // If we don't, the editor is unmounted and canvas state is lost,
  // causing canvasDslRef (used in JSON mode) to show stale data.
  const handleViewModeSwitch = useCallback(
    (mode: 'visual' | 'json') => {
      notifyChange();
      onViewModeSwitch?.(mode);
    },
    [notifyChange, onViewModeSwitch],
  );

  const { selectedNode, setSelectedNode } = useContext(NodeSelectionContext);

  // Keyboard: Delete/Backspace removes the selected node
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedNode || readonly) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        const ctx = editorRef.current;
        if (!ctx || ctx.document.disposed) return;
        const entity = (ctx.document as Record<string, any>).getNode?.(selectedNode.id);
        if (entity && typeof entity.deleteNode === 'function') {
          if (window.confirm(`确认删除节点「${selectedNode.title}」？`)) {
            entity.deleteNode();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNode, readonly]);

  // In JSON mode, render a textarea. Read from canvasDslRef which is kept in sync
  // with the live canvas state by notifyChange — this ensures nodes added in the
  // canvas (like rest_client inside a loop) always appear in the JSON output.
  if (viewMode === 'json') {
    return (
      <div
        className="h-full w-full relative"
        style={{ display: 'flex', flexDirection: 'column' }}
        key={viewMode}
      >
        <textarea
          defaultValue={JSON.stringify(canvasDslRef.current, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              if (parsed.nodes && Array.isArray(parsed.nodes)) {
                onChange(parsed);
              }
            } catch {
              // User is still typing
            }
          }}
          className="w-full h-full font-mono text-sm p-4 border-0 focus:outline-none resize-none"
          spellCheck={false}
          style={{ flex: 1, background: '#fafafa' }}
        />
      </div>
    );
  }

  return (
    <NotifyContext.Provider value={notifyChange}>
    <div className="h-full w-full relative flowgram-editor-wrap" key="visual">
      <FixedLayoutEditorProvider
        ref={editorRef}
        initialData={initialData}
        readonly={readonly}
        nodeRegistries={registries as never[]}
        getNodeDefaultRegistry={getDefaultRegistry}
        nodeEngine={{ enable: true }}
        playground={{
          ineractiveType: 'MOUSE' as const,
          preventGlobalGesture: true,
        }}
        onAllLayersRendered={handleAllLayersRendered}
        scroll={{ enableScrollLimit: true }}
        history={{ enable: true, enableChangeNode: true }}
        materials={{
          components: {
            ...defaultFixedSemiMaterials,
            [FlowRendererKey.ADDER]: NodeAdder,
            [FlowRendererKey.BRANCH_ADDER]: BranchAdder,
            [FlowRendererKey.COLLAPSE]: CustomCollapse,
          },
          renderDefaultNode: DefaultRuleNode,
        }}
        dragdrop={{
          canDrop: () => true,
        }}
      >
        <div className="flex h-full w-full">
          <div className="flex-1 min-w-0 relative" onClick={() => setSelectedNode(null)}>
            <EditorRenderer />
            {!readonly && <EditorToolbar viewMode={viewMode} onViewModeSwitch={handleViewModeSwitch} />}
          </div>
          <NodeConfigPanel />
        </div>
      </FixedLayoutEditorProvider>
    </div>
    </NotifyContext.Provider>
  );
}

/** Floating toolbar — includes view mode toggle + zoom/undo controls. */
function EditorToolbar({
  viewMode,
  onViewModeSwitch,
}: {
  viewMode?: 'visual' | 'json';
  onViewModeSwitch?: (mode: 'visual' | 'json') => void;
}) {
  const { zoomin, zoomout, fitView, undo, redo, canUndo, canRedo, zoom, changeLayout, isVertical } =
    usePlaygroundTools();
  const playground = usePlayground();
  const readonly = playground.config.readonly;

  const btn = (title: string, onClick: () => void, disabled = false, label: string) => (
    <Tooltip content={title} key={title}>
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center justify-center w-8 h-8 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition-colors"
      >
        {label}
      </button>
    </Tooltip>
  );

  return (
    <div
      className="absolute top-3 left-3 z-10 flex items-center gap-0.5 bg-white/90 backdrop-blur rounded-lg shadow-md border border-gray-200 px-1 py-1"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Undo / Redo */}
      {btn('Undo', () => undo(), !canUndo || readonly, '↩')}
      {btn('Redo', () => redo(), !canRedo || readonly, '↪')}
      <div className="w-px h-4 bg-gray-200 mx-1" />

      {/* Zoom */}
      {btn('Zoom In', () => zoomin(), false, '+')}
      <span className="text-xs text-gray-500 min-w-[36px] text-center tabular-nums select-none">
        {Math.round(zoom * 100)}%
      </span>
      {btn('Zoom Out', () => zoomout(), false, '−')}
      {btn('Fit View', () => fitView(), false, '⊡')}
      <div className="w-px h-4 bg-gray-200 mx-1" />

      {/* Layout direction toggle */}
      {btn(
        isVertical ? 'Horizontal Layout' : 'Vertical Layout',
        () => changeLayout(),
        false,
        isVertical ? '⇔' : '⇕',
      )}

      {/* View mode toggle */}
      {onViewModeSwitch && (
        <>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <Tooltip content="Switch view mode">
            <button
              onClick={() => onViewModeSwitch(viewMode === 'json' ? 'visual' : 'json')}
              className="flex items-center justify-center w-8 h-8 rounded-md text-gray-600 hover:bg-gray-100 text-sm transition-colors"
            >
              {viewMode === 'json' ? '🎨' : '{ }'}
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
