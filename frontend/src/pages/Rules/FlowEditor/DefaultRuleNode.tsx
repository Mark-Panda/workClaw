import { useState, useCallback, useContext, useEffect } from 'react';
import { useNodeRender, useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { Modal } from '@douyinfe/semi-ui';
import type { RuleNodeType } from './nodes';
import { NODE_LABELS, NODE_COLORS } from './nodes';
import { NotifyContext } from './context';

/** Per-field UI descriptor so we can render the right input control. */
interface FieldDef {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'select';
  options?: string[];
  required?: boolean;
}

const FIELD_DEFS: Partial<Record<RuleNodeType, FieldDef[]>> = {
  condition: [{ name: 'expression', label: 'CEL Expression', type: 'string', required: true }],
  transform: [{ name: 'field_map', label: 'Field Map', type: 'json' }],
  assign: [{ name: 'variables', label: 'Variables', type: 'json' }],
  delay: [{ name: 'duration_ms', label: 'Duration (ms)', type: 'number', required: true }],
  log: [
    { name: 'level', label: 'Level', type: 'select', options: ['debug', 'info', 'warn', 'error'] },
    { name: 'message', label: 'Message', type: 'string' },
  ],
  script: [{ name: 'script', label: 'Rhai Script', type: 'string', required: true }],
  rest_client: [
    { name: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
    { name: 'url', label: 'URL', type: 'string', required: true },
    { name: 'timeout_ms', label: 'Timeout (ms)', type: 'number' },
  ],
  notification: [{ name: 'webhook_url', label: 'Webhook URL', type: 'string', required: true }],
  subchain: [
    { name: 'subchain_id', label: 'Subchain ID', type: 'string', required: true },
    { name: 'pass_context', label: 'Pass Context', type: 'boolean' },
  ],
  fork: [{ name: 'join_at', label: 'Join Node ID', type: 'string', required: true }],
  join: [{ name: 'merge_strategy', label: 'Merge Strategy', type: 'select', options: ['merge', 'first', 'array'] }],
  loop: [
    { name: 'iterator_source', label: 'Iterator Source', type: 'string', required: true },
    { name: 'loop_var', label: 'Loop Variable', type: 'string', required: true },
    { name: 'max_iterations', label: 'Max Iterations', type: 'number' },
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

export default function DefaultRuleNode() {
  const { data, activated, onMouseEnter, onMouseLeave, form } = useNodeRender();
  const [modalVisible, setModalVisible] = useState(false);
  const ctx = useClientContext();
  const notifyChange = useContext(NotifyContext);

  // Propagate form value changes up to the DSL
  useEffect(() => {
    if (!form) return;
    const disposable = form.onFormValuesChange(() => {
      notifyChange();
    });
    return () => disposable.dispose();
  }, [form, notifyChange]);

  const ruleNodeType = (data?.ruleNodeType as RuleNodeType) ?? (data?.type as string) ?? 'default';
  const title = (data?.title as string) ?? NODE_LABELS[ruleNodeType as RuleNodeType] ?? ruleNodeType;
  const color = NODE_COLORS[ruleNodeType as RuleNodeType] ?? '#8c8c8c';

  const fields = FIELD_DEFS[ruleNodeType as RuleNodeType];
  const config = (form?.values?.config ?? data?.config ?? {}) as Record<string, unknown>;

  const readonly = ctx?.playground?.config?.readonly ?? false;

  // Click node → open modal
  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!readonly && fields && fields.length > 0) {
        setModalVisible(true);
      }
    },
    [fields, readonly],
  );

  const handleClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleChange = useCallback(
    (name: string, value: unknown) => {
      form?.setValueIn(`config.${name}`, value);
    },
    [form],
  );

  return (
    <>
      {/* Node card — click to edit */}
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={handleNodeClick}
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: activated ? '2px solid #3370ff' : '1px solid #d9d9d9',
          borderRadius: 8,
          boxShadow: activated
            ? '0 2px 8px rgba(51, 112, 255, 0.15)'
            : '0 1px 3px rgba(0,0,0,0.06)',
          cursor: 'pointer',
          boxSizing: 'border-box',
          overflow: 'hidden',
          minWidth: 140,
          transition: 'border-color .15s, box-shadow .15s',
        }}
      >
        {/* Colored top bar + title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 14px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: 3,
              backgroundColor: color,
              borderRadius: '8px 8px 0 0',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
        </div>
      </div>

      {/* Config modal */}
      <Modal
        title={
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>
            Configure — {title}
          </span>
        }
        visible={modalVisible}
        onCancel={handleClose}
        onOk={handleClose}
        okText="Done"
        cancelText="Cancel"
        width={520}
        bodyStyle={{ padding: '16px 24px', maxHeight: '60vh', overflow: 'auto' }}
        closeOnEsc
        maskClosable
      >
        {fields && fields.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {fields.map((field) => (
              <div key={field.name}>
                <label style={labelStyle}>
                  {field.label}
                  {field.required ? (
                    <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>
                  ) : null}
                </label>
                {renderFieldInput(field, config[field.name], handleChange)}
                {field.required && !config[field.name] && (
                  <span style={{ fontSize: 11, color: '#e53e3e', marginTop: 2, display: 'block' }}>
                    This field is required
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '16px 0' }}>
            No configuration available for this node type.
          </div>
        )}
      </Modal>
    </>
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
          <option key={opt} value={opt}>
            {opt}
          </option>
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
        placeholder={field.required ? 'Required' : ''}
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
          // Try to parse JSON on blur
          try {
            const parsed = JSON.parse(e.target.value);
            onChange(field.name, parsed);
          } catch {
            // Invalid JSON, revert on blur
          }
          e.target.style.borderColor = '#d9d9d9';
        }}
      />
    );
  }

  // string — multi-line for scripts
  if (field.name === 'script') {
    return (
      <textarea
        style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
        value={String(value ?? '')}
        placeholder={field.required ? 'Required' : ''}
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
      placeholder={field.required ? 'Required' : ''}
      onChange={(e) => onChange(field.name, e.target.value)}
      onFocus={(e) => { e.target.style.borderColor = '#3370ff'; }}
      onBlur={(e) => { e.target.style.borderColor = '#d9d9d9'; }}
    />
  );
}
