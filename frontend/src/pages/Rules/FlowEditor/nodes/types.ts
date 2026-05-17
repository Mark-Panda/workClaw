import type { FixedLayoutPluginContext, FlowNodeEntity, FlowNodeJSON } from '@flowgram.ai/fixed-layout-editor';

/**
 * DSL-level rule node types (used in the JSON DSL, API, and user-facing labels).
 * These are the "source of truth" for rule chain node kinds.
 */
export const RULE_NODE_TYPES = [
  'start', 'end', 'condition', 'transform', 'assign', 'delay', 'log',
  'script', 'rest_client', 'notification', 'subchain', 'fork', 'join', 'loop',
] as const;

export type RuleNodeType = (typeof RULE_NODE_TYPES)[number];

/**
 * FlowGram reserves several type names as FlowNodeBaseType enum values
 * ("start", "end", "condition", "block", etc.). Using those directly
 * causes the layout engine to treat our nodes as special structural
 * markers, breaking positioning and edge rendering.
 *
 * We prefix the three conflicting types with "rule_" so FlowGram
 * treats them as ordinary custom nodes. All other DSL types pass
 * through unchanged.
 */
const FLOWGRAM_TYPE_CONFLICTS = new Set<string>(['start', 'end', 'condition']);

export function toFlowGramType(dslType: RuleNodeType | string): string {
  return FLOWGRAM_TYPE_CONFLICTS.has(dslType) ? `rule_${dslType}` : dslType;
}

export function toRuleNodeType(flowGramType: string): string {
  return flowGramType.startsWith('rule_') ? flowGramType.slice(5) : flowGramType;
}

export const NODE_LABELS: Record<RuleNodeType, string> = {
  start: 'Start', end: 'End', condition: 'Condition', transform: 'Transform',
  assign: 'Assign', delay: 'Delay', log: 'Log', script: 'Script',
  rest_client: 'REST Client', notification: 'Notification',
  subchain: 'Subchain', fork: 'Fork', join: 'Join', loop: 'Loop',
};

export const NODE_COLORS: Record<RuleNodeType, string> = {
  start: '#52c41a', end: '#ff4d4f', condition: '#faad14', transform: '#1890ff',
  assign: '#722ed1', delay: '#13c2c2', log: '#8c8c8c', script: '#eb2f96',
  rest_client: '#2f54eb', notification: '#fa8c16', subchain: '#a0d911',
  fork: '#1890ff', join: '#52c41a', loop: '#722ed1',
};

export const NODE_DESCRIPTIONS: Record<RuleNodeType, string> = {
  start: 'Entry point of the rule chain',
  end: 'Terminal point',
  condition: 'Branch based on a CEL expression',
  transform: 'Map fields from input to output',
  assign: 'Set variables in the execution context',
  delay: 'Pause execution for a duration',
  log: 'Log a message during execution',
  script: 'Run Rhai scripting code',
  rest_client: 'Make an HTTP request',
  notification: 'Send a webhook notification',
  subchain: 'Execute a nested rule chain',
  fork: 'Run branches in parallel',
  join: 'Merge parallel branch results',
  loop: 'Iterate over an array',
};

/** Simple SVG data URI icons for each node type (16x16 colored circles). */
export function nodeIcon(type: RuleNodeType): string {
  const color = NODE_COLORS[type] ?? '#8c8c8c';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="${encodeURIComponent(color)}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/></svg>`;
  return `data:image/svg+xml,${svg}`;
}

export const NODE_CATEGORIES: { label: string; types: RuleNodeType[] }[] = [
  { label: 'Flow Control', types: ['start', 'end'] },
  { label: 'Logic', types: ['condition', 'transform', 'assign', 'script'] },
  { label: 'Actions', types: ['rest_client', 'notification', 'log', 'delay'] },
  { label: 'Composition', types: ['subchain', 'fork', 'join', 'loop'] },
];

/** Our extended registry shape matching the demo pattern. */
export interface RuleNodeRegistry {
  type: string;
  meta?: Record<string, unknown>;
  formMeta?: Record<string, unknown>;
  info: { icon: string; description: string };
  canAdd?: (ctx: FixedLayoutPluginContext, from: FlowNodeEntity) => boolean;
  canDelete?: (ctx: FixedLayoutPluginContext, from: FlowNodeEntity) => boolean;
  onAdd: (ctx: FixedLayoutPluginContext, from: FlowNodeEntity) => FlowNodeJSON;
}

function defaultConfig(type: RuleNodeType): Record<string, unknown> {
  const m: Partial<Record<RuleNodeType, Record<string, unknown>>> = {
    condition: { expression: 'true' },
    transform: { field_map: {} },
    assign: { variables: {} },
    delay: { duration_ms: 1000 },
    log: { level: 'info', message: '' },
    script: { script: '// Rhai script\nlet result = input;\nresult' },
    rest_client: { method: 'POST', url: 'https://example.com/api', timeout_ms: 10000 },
    notification: { webhook_url: '' },
    subchain: { subchain_id: '', pass_context: true },
    fork: { join_at: '' },
    join: { merge_strategy: 'merge' },
    loop: { iterator_source: '', loop_var: 'item', max_iterations: 1000 },
  };
  return m[type] ?? {};
}

let _idCounter = 0;

/** Create a fresh node JSON for the given type. */
export function createNodeJSON(type: RuleNodeType, _from: FlowNodeEntity): FlowNodeJSON {
  _idCounter += 1;
  const id = `${type}_${_idCounter}`;
  return {
    id,
    type: toFlowGramType(type),
    data: {
      ruleNodeType: type,
      title: NODE_LABELS[type],
      config: defaultConfig(type),
    },
  };
}

/** Build a RuleNodeRegistry for a given type. */
export function makeRegistry(type: RuleNodeType): RuleNodeRegistry {
  const flowType = toFlowGramType(type);
  return {
    type: flowType,
    meta: {
      size: { width: 160, height: 48 },
      deleteDisable: type === 'start',
      isStart: type === 'start',
    },
    info: {
      icon: nodeIcon(type),
      description: NODE_DESCRIPTIONS[type],
    },
    canAdd(_ctx, _from) {
      return true;
    },
    canDelete(_ctx, _from) {
      return type !== 'start';
    },
    onAdd(ctx, from) {
      return createNodeJSON(type, from);
    },
    // formMeta is kept for the node engine to render config forms
    formMeta: buildFormMeta(type),
  };
}

function buildFormMeta(type: RuleNodeType): Record<string, unknown> | undefined {
  if (type === 'start' || type === 'end') {
    return { root: { name: 'config', type: 'object', title: NODE_LABELS[type], children: [] } };
  }
  const formMetas: Record<string, Record<string, unknown>> = {
    condition: { root: { name: 'config', type: 'object', title: 'Condition', children: [{ name: 'expression', type: 'string', title: 'CEL Expression', default: 'true', required: true }] } },
    transform: { root: { name: 'config', type: 'object', title: 'Transform', children: [{ name: 'field_map', type: 'object', title: 'Field Map', default: {} }] } },
    assign: { root: { name: 'config', type: 'object', title: 'Assign', children: [{ name: 'variables', type: 'object', title: 'Variables', default: {} }] } },
    delay: { root: { name: 'config', type: 'object', title: 'Delay', children: [{ name: 'duration_ms', type: 'number', title: 'Duration (ms)', default: 1000, required: true }] } },
    log: { root: { name: 'config', type: 'object', title: 'Log', children: [{ name: 'level', type: 'string', title: 'Level', default: 'info', enum: ['debug', 'info', 'warn', 'error'] }, { name: 'message', type: 'string', title: 'Message', default: '' }] } },
    script: { root: { name: 'config', type: 'object', title: 'Script', children: [{ name: 'script', type: 'string', title: 'Rhai Script', default: '// Rhai script', required: true }] } },
    rest_client: { root: { name: 'config', type: 'object', title: 'REST Client', children: [{ name: 'method', type: 'string', title: 'Method', default: 'POST', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }, { name: 'url', type: 'string', title: 'URL', default: '', required: true }, { name: 'timeout_ms', type: 'number', title: 'Timeout (ms)', default: 10000 }] } },
    notification: { root: { name: 'config', type: 'object', title: 'Notification', children: [{ name: 'webhook_url', type: 'string', title: 'Webhook URL', default: '', required: true }] } },
    subchain: { root: { name: 'config', type: 'object', title: 'Subchain', children: [{ name: 'subchain_id', type: 'string', title: 'Subchain ID', default: '', required: true }, { name: 'pass_context', type: 'boolean', title: 'Pass Context', default: true }] } },
    fork: { root: { name: 'config', type: 'object', title: 'Fork', children: [{ name: 'join_at', type: 'string', title: 'Join Node ID', default: '', required: true }] } },
    join: { root: { name: 'config', type: 'object', title: 'Join', children: [{ name: 'merge_strategy', type: 'string', title: 'Merge Strategy', default: 'merge', enum: ['merge', 'first', 'array'] }] } },
    loop: { root: { name: 'config', type: 'object', title: 'Loop', children: [{ name: 'iterator_source', type: 'string', title: 'Iterator Source', default: '', required: true }, { name: 'loop_var', type: 'string', title: 'Loop Variable', default: 'item', required: true }, { name: 'max_iterations', type: 'number', title: 'Max Iterations', default: 1000 }] } },
  };
  return formMetas[type];
}

/** All node registries, ready for the editor. */
export function buildRegistries(): RuleNodeRegistry[] {
  return RULE_NODE_TYPES.map((t) => makeRegistry(t));
}
