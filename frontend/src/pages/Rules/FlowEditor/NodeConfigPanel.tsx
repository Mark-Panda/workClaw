import { useState, useCallback, useContext, useEffect } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import type { RuleNodeType } from './nodes';
import { NODE_LABELS, NODE_COLORS, nodeIcon } from './nodes';
import { NotifyContext } from './context';
import { NodeSelectionContext } from './nodeSelection';

/** Per-field UI descriptor. */
interface FieldDef {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'select';
  options?: string[];
  required?: boolean;
}

const FIELD_DEFS: Partial<Record<RuleNodeType, FieldDef[]>> = {
  condition: [{ name: 'expression', label: 'CEL 表达式', type: 'string', required: true }],
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
};

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
