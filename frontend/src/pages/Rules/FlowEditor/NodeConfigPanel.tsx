import { useState, useCallback, useContext, useEffect, useRef } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import type { RuleNodeType } from './nodes';
import { NODE_LABELS, NODE_COLORS, nodeIcon } from './nodes';
import { NotifyContext } from './context';
import { NodeSelectionContext } from './nodeSelection';

/** Per-field UI descriptor. */
interface FieldDef {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'select' | 'expr';
  options?: string[];
  required?: boolean;
}

const FIELD_DEFS: Partial<Record<RuleNodeType, FieldDef[]>> = {
  condition: [{ name: 'expression', label: '条件表达式 (Expr)', type: 'expr', required: true }],
  if: [{ name: 'expression', label: '条件表达式 (Expr)', type: 'expr', required: true }],
  switch: [{ name: 'join_at', label: '合并节点 ID', type: 'string', required: true }],
  case: [{ name: 'condition', label: '条件表达式', type: 'expr' }],
  transform: [{ name: 'field_map', label: '字段映射', type: 'json' }],
  assign: [{ name: 'variables', label: '变量', type: 'json' }],
  delay: [{ name: 'duration_ms', label: '延迟 (ms)', type: 'number', required: true }],
  log: [
    { name: 'level', label: '级别', type: 'select', options: ['debug', 'info', 'warn', 'error'] },
    { name: 'message', label: '消息', type: 'string' },
  ],
  script: [{ name: 'script', label: 'Rhai 脚本', type: 'string', required: true }],
  rest_client: [
    { name: 'method', label: '方法', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
    { name: 'url', label: 'URL', type: 'string', required: true },
    { name: 'timeout_ms', label: '超时 (ms)', type: 'number' },
  ],
  notification: [{ name: 'webhook_url', label: 'Webhook URL', type: 'string', required: true }],
  subchain: [
    { name: 'subchain_id', label: '子链 ID', type: 'string', required: true },
    { name: 'pass_context', label: '传递上下文', type: 'boolean' },
  ],
  fork: [{ name: 'join_at', label: '合并节点 ID', type: 'string', required: true }],
  join: [{ name: 'merge_strategy', label: '合并策略', type: 'select', options: ['merge', 'first', 'array'] }],
  loop: [
    { name: 'iterator_source', label: '迭代源', type: 'string', required: true },
    { name: 'loop_var', label: '循环变量', type: 'string', required: true },
    { name: 'max_iterations', label: '最大迭代次数', type: 'number' },
  ],
  llm: [
    { name: 'model', label: '模型', type: 'string', required: true },
    { name: 'prompt', label: '提示词', type: 'string', required: true },
    { name: 'temperature', label: '温度', type: 'number' },
    { name: 'max_tokens', label: '最大 Token', type: 'number' },
  ],
  break_loop: [],
  try_catch: [],
  if_block: [],
  try_block: [],
  catch_block: [],
  case_default: [],
  start: [],
  end: [],
};

// ─── Expr 语言参考数据 ────────────────────────────────────────────

const EXPR_OPERATORS: { group: string; items: { op: string; desc: string }[] }[] = [
  {
    group: '比较运算符',
    items: [
      { op: '==', desc: '等于' },
      { op: '!=', desc: '不等于' },
      { op: '<', desc: '小于' },
      { op: '>', desc: '大于' },
      { op: '<=', desc: '小于等于' },
      { op: '>=', desc: '大于等于' },
      { op: 'in', desc: '属于集合' },
      { op: 'not in', desc: '不属于集合' },
    ],
  },
  {
    group: '逻辑运算符',
    items: [
      { op: 'and / &&', desc: '逻辑与' },
      { op: 'or / ||', desc: '逻辑或' },
      { op: 'not / !', desc: '逻辑非' },
    ],
  },
  {
    group: '字符串函数',
    items: [
      { op: 'contains(str, substr)', desc: '包含子串' },
      { op: 'startsWith(str, prefix)', desc: '以前缀开头' },
      { op: 'endsWith(str, suffix)', desc: '以后缀结尾' },
      { op: 'matches(str, pattern)', desc: '正则匹配' },
      { op: 'len(str)', desc: '字符串长度' },
    ],
  },
  {
    group: '数组/集合函数',
    items: [
      { op: 'all(collection, pred)', desc: '所有元素满足条件' },
      { op: 'any(collection, pred)', desc: '任一元素满足条件' },
      { op: 'one(collection, pred)', desc: '恰好一个元素满足' },
      { op: 'none(collection, pred)', desc: '没有元素满足条件' },
      { op: 'filter(collection, pred)', desc: '过滤集合' },
      { op: 'map(collection, expr)', desc: '映射转换' },
      { op: 'count(collection)', desc: '元素数量' },
    ],
  },
  {
    group: '其他',
    items: [
      { op: '??', desc: '空值合并 (nil coalescing)' },
      { op: '? :', desc: '三元运算符' },
      { op: '..', desc: '范围操作符' },
      { op: '?', desc: '可选链 (optional chaining)' },
      { op: '|', desc: '管道操作符' },
    ],
  },
];

const EXPR_TEMPLATES: { label: string; expr: string }[] = [
  { label: '等于', expr: 'value == "expected"' },
  { label: '不等于', expr: 'value != "expected"' },
  { label: '数字比较', expr: 'value >= 100' },
  { label: '且条件', expr: 'condition1 && condition2' },
  { label: '或条件', expr: 'condition1 || condition2' },
  { label: '包含', expr: 'contains(str, "substring")' },
  { label: '正则匹配', expr: 'matches(str, "^pattern$")' },
  { label: '属于集合', expr: 'value in ["a", "b", "c"]' },
  { label: '非空', expr: 'value != nil && value != ""' },
  { label: '三元', expr: 'age >= 18 ? "adult" : "minor"' },
];

// ─── 渲染样式 ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid #d9d9d9',
  borderRadius: 6,
  background: '#fff',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color .2s',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  display: 'block',
  marginBottom: 4,
};

export default function NodeConfigPanel() {
  const { selectedNode, setSelectedNode } = useContext(NodeSelectionContext);
  const ctx = useClientContext();
  const notifyChange = useContext(NotifyContext);

  // Force re-render when form values change
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // Access the node entity and its form from the FlowGram document
  const form: {
    values: Record<string, unknown>;
    setValueIn: (path: string, val: unknown) => void;
    onFormValuesChange: (cb: () => void) => { dispose: () => void };
  } | null = (() => {
    if (!selectedNode || !ctx?.document) return null;
    try {
      // FlowGram stores node entities in the document. We access them via internal API.
      const entity = (ctx.document as Record<string, any>).getNode?.(selectedNode.id)
        ?? (ctx.document as Record<string, any>).findNode?.(selectedNode.id);
      if (!entity) return null;
      return (entity as Record<string, unknown>).form as typeof form;
    } catch {
      return null;
    }
  })();

  // Subscribe to form value changes
  useEffect(() => {
    if (!form) return;
    const disposable = form.onFormValuesChange(() => {
      forceUpdate();
      notifyChange();
    });
    return () => disposable.dispose();
  }, [form, forceUpdate, notifyChange]);

  const ruleNodeType = (selectedNode?.ruleNodeType ?? '') as RuleNodeType;
  const title = selectedNode?.title ?? NODE_LABELS[ruleNodeType] ?? ruleNodeType;
  const color = NODE_COLORS[ruleNodeType] ?? '#8c8c8c';
  const icon = nodeIcon(ruleNodeType);
  const fields = FIELD_DEFS[ruleNodeType];
  const config = (form?.values?.config ?? {}) as Record<string, unknown>;

  const handleChange = useCallback(
    (name: string, value: unknown) => {
      form?.setValueIn(`config.${name}`, value);
      forceUpdate();
      setTimeout(() => notifyChange(), 0);
    },
    [form, forceUpdate, notifyChange],
  );

  const handleClose = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  if (!selectedNode) return null;

  return (
    <div
      style={{
        width: 280,
        borderLeft: '1px solid #e5e7eb',
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 6,
            height: 30,
            borderRadius: 3,
            background: color,
            flexShrink: 0,
          }}
        />
        <img src={icon} alt="" width={18} height={18} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
          {title}
        </span>
        <button
          onClick={handleClose}
          style={{
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 16,
            color: '#9ca3af',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* Fields */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {fields && fields.length > 0 ? (
          fields.map((field) => (
            <div key={field.name}>
              <label style={labelStyle}>
                {field.label}
                {field.required ? (
                  <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>
                ) : null}
              </label>
              {renderFieldInput(field, config[field.name], handleChange)}
              {field.required && (config[field.name] === undefined || config[field.name] === '') && (
                <span style={{ fontSize: 11, color: '#e53e3e', marginTop: 2, display: 'block' }}>
                  此字段必填
                </span>
              )}
              {field.type === 'expr' && (
                <ExprReferencePanel
                  value={String(config[field.name] ?? '')}
                  onChange={(val) => handleChange(field.name, val)}
                />
              )}
            </div>
          ))
        ) : (
          <div
            style={{
              fontSize: 13,
              color: '#6b7280',
              textAlign: 'center',
              padding: '24px 0',
            }}
          >
            此节点类型无可配置项。
          </div>
        )}
      </div>
    </div>
  );
}

function renderFieldInput(
  field: FieldDef,
  value: unknown,
  onChange: (name: string, value: unknown) => void,
) {
  if (field.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field.name, e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <select
        style={inputStyle}
        value={String(value ?? field.options[0])}
        onChange={(e) => onChange(field.name, e.target.value)}
        onFocus={(e) => { e.target.style.borderColor = '#3370ff'; }}
        onBlur={(e) => { e.target.style.borderColor = '#d9d9d9'; }}
      >
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        style={inputStyle}
        value={value != null ? String(value) : ''}
        placeholder={field.required ? '必填' : ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(field.name, v === '' ? undefined : Number(v));
        }}
        onFocus={(e) => { e.target.style.borderColor = '#3370ff'; }}
        onBlur={(e) => { e.target.style.borderColor = '#d9d9d9'; }}
      />
    );
  }

  if (field.type === 'json') {
    const text = value != null ? JSON.stringify(value, null, 2) : '';
    return (
      <textarea
        style={{ ...inputStyle, minHeight: 72, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
        value={text}
        placeholder="{}"
        rows={4}
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value);
            onChange(field.name, parsed);
          } catch {
            // Let user keep typing
          }
        }}
        onFocus={(e) => { e.target.style.borderColor = '#3370ff'; }}
        onBlur={(e) => {
          try {
            const parsed = JSON.parse(e.target.value);
            onChange(field.name, parsed);
          } catch {
            // Invalid JSON
          }
          e.target.style.borderColor = '#d9d9d9';
        }}
      />
    );
  }

  if (field.name === 'script') {
    return (
      <textarea
        style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
        value={String(value ?? '')}
        placeholder={field.required ? '必填' : ''}
        rows={6}
        onChange={(e) => onChange(field.name, e.target.value)}
        onFocus={(e) => { e.target.style.borderColor = '#3370ff'; }}
        onBlur={(e) => { e.target.style.borderColor = '#d9d9d9'; }}
      />
    );
  }

  if (field.type === 'expr') {
    return (
      <textarea
        style={{
          ...inputStyle,
          minHeight: 120,
          resize: 'vertical',
          fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
          fontSize: 13,
          lineHeight: 1.6,
          background: '#1e1e2e',
          color: '#cdd6f4',
          padding: '10px 12px',
          border: '1px solid #45475a',
        }}
        value={String(value ?? '')}
        placeholder={field.required ? '输入 Expr 表达式...' : ''}
        rows={6}
        spellCheck={false}
        onChange={(e) => onChange(field.name, e.target.value)}
        onFocus={(e) => { e.target.style.borderColor = '#89b4fa'; }}
        onBlur={(e) => { e.target.style.borderColor = '#45475a'; }}
      />
    );
  }

  return (
    <input
      type="text"
      style={inputStyle}
      value={value != null ? String(value) : ''}
      placeholder={field.required ? '必填' : ''}
      onChange={(e) => onChange(field.name, e.target.value)}
      onFocus={(e) => { e.target.style.borderColor = '#3370ff'; }}
      onBlur={(e) => { e.target.style.borderColor = '#d9d9d9'; }}
    />
  );
}

/** Collapsible Expr 语言参考面板：显示操作符分组和常用模板。 */
function ExprReferencePanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const sectionHeader: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 0',
    userSelect: 'none',
  };

  const groupLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const chipStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 6px',
    fontSize: 11,
    fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
    background: '#eef2ff',
    color: '#4338ca',
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  };

  const descStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#6b7280',
    marginLeft: 4,
  };

  const templateBtnBase: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '6px 8px',
    fontSize: 12,
    fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    cursor: 'pointer',
    color: '#1f2937',
    marginBottom: 4,
    lineHeight: 1.5,
  };

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 4 }}>
      <div style={sectionHeader} onClick={() => setOpen(!open)}>
        <span
          style={{
            display: 'inline-block',
            transition: 'transform .2s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            fontSize: 10,
            color: '#9ca3af',
          }}
        >
          ▶
        </span>
        Expr 操作符参考
      </div>

      {open && (
        <div style={{ padding: '4px 0 8px' }}>
          {/* Operator groups */}
          {EXPR_OPERATORS.map((group) => (
            <div key={group.group}>
              <div style={groupLabel}>{group.group}</div>
              <div style={{ marginBottom: 6 }}>
                {group.items.map((item) => (
                  <span key={item.op}>
                    <code style={chipStyle}>{item.op}</code>
                    <span style={descStyle}>{item.desc}</span>
                    <br />
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* Divider */}
          <div style={{ height: 1, background: '#e5e7eb', margin: '8px 0' }} />

          {/* Template buttons */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
            常用模板 — 点击替换当前表达式
          </div>
          {EXPR_TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              style={templateBtnBase}
              onClick={() => onChange(tpl.expr)}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
              title={tpl.expr}
            >
              <span
                style={{
                  color: '#6b7280',
                  fontWeight: 500,
                  marginRight: 6,
                  fontFamily: 'inherit',
                  fontSize: 11,
                }}
              >
                {tpl.label}:
              </span>
              {tpl.expr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
