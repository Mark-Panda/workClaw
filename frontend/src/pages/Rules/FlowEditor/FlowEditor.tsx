import { useCallback, useRef, useMemo } from 'react';
import {
  FixedLayoutEditorProvider,
  EditorRenderer,
  usePlaygroundTools,
  usePlayground,
  type FixedLayoutPluginContext,
  type FlowNodeJSON,
  type FlowNodeType,
  FlowRendererKey,
} from '@flowgram.ai/fixed-layout-editor';
import type { FlowDocumentJSON } from '@flowgram.ai/fixed-layout-editor';
import { defaultFixedSemiMaterials } from '@flowgram.ai/fixed-semi-materials';
import { Tooltip } from '@douyinfe/semi-ui';
import type { RuleChainDsl } from '../../../types/rule';
import { buildRegistries } from './nodes';
import { dslToFlowDocument, flowDocumentToDsl } from './converter';
import { NotifyContext } from './context';
import NodeAdder from './NodeAdder';
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
      // DSL state as long as both endpoints still exist.
      const nodeIds = new Set(newDsl.nodes.map((n) => n.id));
      const newEdgeKeys = new Set(newDsl.edges.map((e) => `${e.from}→${e.to}`));

      for (const e of prevDsl.edges) {
        const key = `${e.from}→${e.to}`;
        if (nodeIds.has(e.from) && nodeIds.has(e.to) && !newEdgeKeys.has(key)) {
          newDsl.edges.push(e);
          newEdgeKeys.add(key);
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
    <div className="h-full w-full relative flowgram-editor-wrap">
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
            [FlowRendererKey.COLLAPSE]: CustomCollapse,
          },
          renderDefaultNode: DefaultRuleNode,
        }}
        dragdrop={{
          canDrop: () => true,
        }}
      >
        <div className="flex h-full w-full">
          <div className="flex-1 min-w-0 relative">
            <EditorRenderer />
            {!readonly && <EditorToolbar viewMode={viewMode} onViewModeSwitch={onViewModeSwitch} />}
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
