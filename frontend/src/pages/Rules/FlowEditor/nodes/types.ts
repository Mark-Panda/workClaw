import type { FixedLayoutPluginContext, FlowNodeEntity, FlowNodeJSON } from '@flowgram.ai/fixed-layout-editor';

/**
 * DSL-level rule node types (used in the JSON DSL, API, and user-facing labels).
 * These are the "source of truth" for rule chain node kinds.
 *
 * Architecture note: case/case_default/if_block/try_block/catch_block are
 * UI-only branch marker types. They exist on the canvas as visual containers
 * for branch blocks inside switch/if/try_catch, but they are NOT separate
 * backend node types — the backend has no CaseNode, IfBlock, or CatchBlock.
 * The converter (flowDocumentToDsl) skips them and stores their data
 * (conditions, error info) inline in the parent node's config.
 */
export const RULE_NODE_TYPES = [
  'start', 'end',
  'condition', 'if', 'if_block',
  'switch', 'case', 'case_default',
  'try_catch', 'try_block', 'catch_block',
  'break_loop',
  'llm',
  'transform', 'assign', 'delay', 'log',
  'script', 'rest_client', 'notification',
  'subchain', 'fork', 'join', 'loop',
] as const;

export type RuleNodeType = (typeof RULE_NODE_TYPES)[number];

/** Branch marker types — visual-only on canvas, no backend node handler. */
export const BRANCH_MARKER_TYPES = new Set<string>([
  'case', 'case_default', 'if_block', 'try_block', 'catch_block', '__branch__',
]);

/**
 * FlowGram reserves several type names as FlowNodeBaseType enum values
 * ("start", "end", "condition", "block", etc.). Using those directly
 * causes the layout engine to treat our nodes as special structural
 * markers, breaking positioning and edge rendering.
 *
 * We prefix conflicting types with "rule_" so FlowGram treats
 * them as ordinary custom nodes. All other DSL types pass through.
 */
const FLOWGRAM_TYPE_CONFLICTS = new Set<string>(['start', 'end', 'condition']);

export function toFlowGramType(dslType: RuleNodeType | string): string {
  return FLOWGRAM_TYPE_CONFLICTS.has(dslType) ? `rule_${dslType}` : dslType;
}

export function toRuleNodeType(flowGramType: string): string {
  return flowGramType.startsWith('rule_') ? flowGramType.slice(5) : flowGramType;
}

/**
 * Map DSL container node types to FlowGram built-in container types
 * so the layout engine renders them as proper containers with branches.
 */
export function getNodeFlowType(dslType: string): string {
  if (dslType === 'switch' || dslType === 'fork') return 'dynamicSplit';
  if (dslType === 'if' || dslType === 'try_catch') return 'staticSplit';
  return toFlowGramType(dslType);
}

export const NODE_LABELS: Record<string, string> = {
  start: '开始', end: '结束',
  condition: '条件', transform: '转换', assign: '赋值',
  delay: '延迟', log: '日志', script: '脚本',
  rest_client: 'REST 请求', notification: '通知',
  subchain: '子链', fork: '分支', join: '合并', loop: '循环',
  switch: 'Switch', case: 'Case', case_default: '默认',
  if: 'If', if_block: '分支',
  try_catch: '异常处理', try_block: 'Try', catch_block: 'Catch',
  break_loop: '跳出循环',
  llm: 'LLM 调用',
};

export const NODE_COLORS: Record<string, string> = {
  start: '#52c41a', end: '#ff4d4f',
  condition: '#faad14', transform: '#1890ff',
  assign: '#722ed1', delay: '#13c2c2',
  log: '#8c8c8c', script: '#eb2f96',
  rest_client: '#2f54eb', notification: '#fa8c16',
  subchain: '#a0d911', fork: '#1890ff', join: '#52c41a', loop: '#722ed1',
  switch: '#fa8c16', case: '#1890ff', case_default: '#8c8c8c',
  if: '#faad14', if_block: '#52c41a',
  try_catch: '#eb2f96', try_block: '#52c41a', catch_block: '#ff4d4f',
  break_loop: '#8c8c8c',
  llm: '#2f54eb',
};

export const NODE_DESCRIPTIONS: Record<string, string> = {
  start: '规则链的入口节点',
  end: '规则链的终止节点',
  condition: '基于表达式条件分支',
  transform: '映射输入字段到输出',
  assign: '在上下文中设置变量',
  delay: '暂停执行一段时间',
  log: '在执行期间记录日志',
  script: '执行 Rhai 脚本代码',
  rest_client: '发送 HTTP 请求',
  notification: '发送 Webhook 通知',
  subchain: '执行嵌套规则链',
  fork: '并行执行多个分支',
  join: '合并并行分支结果',
  loop: '遍历数组迭代执行',
  switch: '根据条件路由到多个分支',
  case: 'Switch 的条件分支标记',
  case_default: 'Switch 的默认分支',
  if: '条件判断，分为真/假两个分支',
  if_block: 'If 的分支块标记',
  try_catch: '异常捕获与处理',
  try_block: 'Try 执行块标记',
  catch_block: 'Catch 处理块标记',
  break_loop: '跳出当前循环',
  llm: '调用大语言模型生成响应',
};

/** Simple SVG data URI icons for each node type (16x16 colored circles). */
export function nodeIcon(type: string): string {
  const color = NODE_COLORS[type] ?? '#8c8c8c';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="${encodeURIComponent(color)}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/></svg>`;
  return `data:image/svg+xml,${svg}`;
}

export const NODE_CATEGORIES: { label: string; types: string[] }[] = [
  { label: '流程控制', types: ['start', 'end', 'break_loop'] },
  { label: '逻辑', types: ['condition', 'if', 'switch', 'try_catch'] },
  { label: '动作', types: ['llm', 'transform', 'assign', 'script', 'rest_client', 'notification', 'delay', 'log'] },
  { label: '组合', types: ['subchain', 'fork', 'join', 'loop'] },
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

function defaultConfig(type: string): Record<string, unknown> {
  const m: Record<string, Record<string, unknown>> = {
    condition: { expression: 'true' },
    transform: { field_map: {} },
    assign: { variables: {} },
    delay: { duration_ms: 1000 },
    log: { level: 'info', message: '' },
    script: { script: '// Rhai script\nlet result = input;\nresult' },
    rest_client: { method: 'POST', url: '', timeout_ms: 10000 },
    notification: { webhook_url: '' },
    subchain: { subchain_id: '', pass_context: true },
    fork: { join_at: '' },
    join: { merge_strategy: 'merge' },
    loop: { iterator_source: '', loop_var: 'item', max_iterations: 1000 },
    llm: { model: '', prompt: '', temperature: 0.7, max_tokens: 1024 },
    switch: { branches: [] },
    if: { expression: 'true' },
    try_catch: {},
    case: { condition: '' },
    case_default: {},
    if_block: {},
    try_block: {},
    catch_block: {},
    break_loop: {},
  };
  return m[type] ?? {};
}

let _idCounter = 0;

/** Create a fresh node JSON for the given type. */
export function createNodeJSON(type: string, _from: FlowNodeEntity): FlowNodeJSON {
  _idCounter += 1;
  const id = `${type}_${_idCounter}`;
  const flowType = getNodeFlowType(type);

  const base: FlowNodeJSON = {
    id,
    type: flowType,
    data: {
      ruleNodeType: type,
      title: NODE_LABELS[type] ?? type,
      config: defaultConfig(type),
    },
  };

  // Container nodes get default blocks.
  // IMPORTANT: Do NOT set type on branch blocks — FlowGram needs to use
  // addInlineBlocks to create proper inline/blockIcon/blockOrderIcon wrappers
  // that the layout engine requires.  Mark with __isBranch so the DSL converter
  // skips these structural wrappers during flowDocumentToDsl.
  if (type === 'switch') {
    base.blocks = [
      { id: `${id}_case_1`, data: { ruleNodeType: 'case', title: 'Case 1', config: { condition: '' }, __isBranch: true } as any, blocks: [] },
      { id: `${id}_case_default`, data: { ruleNodeType: 'case_default', title: '默认', config: {}, __isBranch: true } as any, blocks: [] },
    ];
  } else if (type === 'if') {
    base.blocks = [
      { id: `${id}_true`, data: { ruleNodeType: 'if_block', title: 'True', config: {}, __isBranch: true } as any, blocks: [] },
      { id: `${id}_false`, data: { ruleNodeType: 'if_block', title: 'False', config: {}, __isBranch: true } as any, blocks: [] },
    ];
  } else if (type === 'try_catch') {
    base.blocks = [
      { id: `${id}_try`, data: { ruleNodeType: 'try_block', title: 'Try', config: {}, __isBranch: true } as any, blocks: [] },
      { id: `${id}_catch`, data: { ruleNodeType: 'catch_block', title: 'Catch', config: {}, __isBranch: true } as any, blocks: [] },
    ];
  }

  return base;
}

/** Build a RuleNodeRegistry for a given type. */
export function makeRegistry(type: string): RuleNodeRegistry {
  const flowType = getNodeFlowType(type);

  const isContainer = type === 'switch' || type === 'if' || type === 'try_catch';
  const isBlock = BRANCH_MARKER_TYPES.has(type);

  const meta: Record<string, unknown> = {
    size: { width: isBlock ? 140 : 160, height: isBlock ? 28 : 48 },
    deleteDisable: type === 'start' || type === 'case_default',
    isStart: type === 'start',
  };
  if (type === 'end') meta.isNodeEnd = true;
  if (type === 'start') { meta.selectable = false; meta.copyDisable = true; meta.expandable = false; meta.addDisable = true; }
  if (type === 'end') { meta.selectable = false; meta.copyDisable = true; meta.expandable = false; }
  if (isBlock) { meta.copyDisable = true; meta.addDisable = true; meta.sidebarDisable = true; }
  if (type === 'if_block') { meta.defaultExpanded = false; meta.style = { width: 66, height: 20, borderRadius: 4 }; }
  if (isContainer) meta.expandable = false;
  if (type === 'break_loop') { meta.style = { width: 200 }; }

  return {
    type: flowType,
    meta,
    info: {
      icon: nodeIcon(type),
      description: NODE_DESCRIPTIONS[type] ?? '',
    },
    canAdd(_ctx, _from) {
      if (isBlock) return false;
      return true;
    },
    canDelete(_ctx, _from) {
      return type !== 'start' && type !== 'case_default';
    },
    onAdd(ctx, from) {
      return createNodeJSON(type, from);
    },
    formMeta: buildFormMeta(type),
  };
}

function buildFormMeta(type: string): Record<string, unknown> | undefined {
  if (type === 'start' || type === 'end') {
    return { root: { name: 'config', type: 'object', title: NODE_LABELS[type], children: [] } };
  }
  const formMetas: Record<string, Record<string, unknown>> = {
    condition: { root: { name: 'config', type: 'object', title: '条件', children: [{ name: 'expression', type: 'string', title: '表达式', default: 'true', required: true }] } },
    transform: { root: { name: 'config', type: 'object', title: '转换', children: [{ name: 'field_map', type: 'object', title: '字段映射', default: {} }] } },
    assign: { root: { name: 'config', type: 'object', title: '赋值', children: [{ name: 'variables', type: 'object', title: '变量', default: {} }] } },
    delay: { root: { name: 'config', type: 'object', title: '延迟', children: [{ name: 'duration_ms', type: 'number', title: '延迟 (ms)', default: 1000, required: true }] } },
    log: { root: { name: 'config', type: 'object', title: '日志', children: [{ name: 'level', type: 'string', title: '级别', default: 'info', enum: ['debug', 'info', 'warn', 'error'] }, { name: 'message', type: 'string', title: '消息', default: '' }] } },
    script: { root: { name: 'config', type: 'object', title: '脚本', children: [{ name: 'script', type: 'string', title: 'Rhai 脚本', default: '// Rhai script', required: true }] } },
    rest_client: { root: { name: 'config', type: 'object', title: 'REST 请求', children: [{ name: 'method', type: 'string', title: '方法', default: 'POST', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }, { name: 'url', type: 'string', title: 'URL', default: '', required: true }, { name: 'timeout_ms', type: 'number', title: '超时 (ms)', default: 10000 }] } },
    notification: { root: { name: 'config', type: 'object', title: '通知', children: [{ name: 'webhook_url', type: 'string', title: 'Webhook URL', default: '', required: true }] } },
    subchain: { root: { name: 'config', type: 'object', title: '子链', children: [{ name: 'subchain_id', type: 'string', title: '子链 ID', default: '', required: true }, { name: 'pass_context', type: 'boolean', title: '传递上下文', default: true }] } },
    fork: { root: { name: 'config', type: 'object', title: '分支', children: [{ name: 'join_at', type: 'string', title: '合并节点 ID', default: '', required: true }] } },
    join: { root: { name: 'config', type: 'object', title: '合并', children: [{ name: 'merge_strategy', type: 'string', title: '合并策略', default: 'merge', enum: ['merge', 'first', 'array'] }] } },
    loop: { root: { name: 'config', type: 'object', title: '循环', children: [{ name: 'iterator_source', type: 'string', title: '遍历源', default: '', required: true }, { name: 'loop_var', type: 'string', title: '循环变量', default: 'item' }, { name: 'max_iterations', type: 'number', title: '最大迭代次数', default: 1000 }] } },
    llm: { root: { name: 'config', type: 'object', title: 'LLM 调用', children: [{ name: 'model', type: 'string', title: '模型', default: '', required: true }, { name: 'prompt', type: 'string', title: '提示词', default: '', required: true }, { name: 'temperature', type: 'number', title: '温度', default: 0.7 }, { name: 'max_tokens', type: 'number', title: '最大 Token', default: 1024 }] } },
    switch: { root: { name: 'config', type: 'object', title: 'Switch', children: [] } },
    if: { root: { name: 'config', type: 'object', title: 'If', children: [{ name: 'expression', type: 'string', title: '表达式', default: 'true', required: true }] } },
    try_catch: { root: { name: 'config', type: 'object', title: '异常处理', children: [] } },
    case: { root: { name: 'config', type: 'object', title: 'Case 条件', children: [{ name: 'condition', type: 'string', title: '条件表达式', default: '' }] } },
  };
  return formMetas[type];
}

/** All node registries, ready for the editor. */
export function buildRegistries(): RuleNodeRegistry[] {
  return RULE_NODE_TYPES.map((t) => makeRegistry(t));
}
