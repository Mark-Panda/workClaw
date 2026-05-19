import { useState } from 'react';
import type { InterceptorConfig } from '../../../types/rule';

interface Props {
  interceptors: InterceptorConfig[];
  onChange: (interceptors: InterceptorConfig[]) => void;
}

const INTERCEPTOR_TYPES = ['logging', 'metrics', 'auth', 'validation'] as const;

const INTERCEPTOR_LABELS: Record<string, string> = {
  logging: '日志',
  metrics: '指标',
  auth: '认证',
  validation: '校验',
};

const INTERCEPTOR_DESCRIPTIONS: Record<string, string> = {
  logging: '记录节点执行前后的日志',
  metrics: '采集执行耗时和错误率指标',
  auth: '验证请求中的认证令牌',
  validation: '校验输入数据格式和规则',
};

interface FieldDef {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
}

const INTERCEPTOR_FIELDS: Record<string, FieldDef[]> = {
  logging: [
    { name: 'level', label: '日志级别', type: 'select', options: ['debug', 'info', 'warn', 'error'] },
  ],
  auth: [
    { name: 'token_key', label: 'Token 字段名', type: 'string' },
    { name: 'required', label: '必须认证', type: 'boolean' },
  ],
  validation: [
    { name: 'rules', label: '校验规则 (JSON)', type: 'string' },
  ],
  metrics: [],
};

function defaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case 'auth':
      return { token_key: 'auth_token', required: true };
    case 'validation':
      return { rules: [{ field: '', rule: 'required', message: '' }] };
    case 'logging':
      return { level: 'info' };
    case 'metrics':
      return {};
    default:
      return {};
  }
}

export default function InterceptorsPanel({ interceptors, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);

  const addInterceptor = (type: string) => {
    if (interceptors.some((i) => i.type === type)) return;
    onChange([...interceptors, { type, config: defaultConfig(type) }]);
  };

  const removeInterceptor = (type: string) => {
    onChange(interceptors.filter((i) => i.type !== type));
    if (editingType === type) setEditingType(null);
  };

  const updateConfig = (type: string, key: string, value: unknown) => {
    onChange(
      interceptors.map((i) =>
        i.type === type
          ? { ...i, config: { ...i.config, [key]: value } }
          : i,
      ),
    );
  };

  const renderField = (ic: InterceptorConfig, field: FieldDef) => {
    const value = ic.config?.[field.name];
    if (field.type === 'boolean') {
      return (
        <label key={field.name} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => updateConfig(ic.type, field.name, e.target.checked)}
            className="rounded"
          />
          {field.label}
        </label>
      );
    }
    if (field.type === 'select' && field.options) {
      return (
        <div key={field.name}>
          <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
          <select
            className="input-field text-sm"
            value={String(value ?? field.options[0])}
            onChange={(e) => updateConfig(ic.type, field.name, e.target.value)}
          >
            {field.options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div key={field.name}>
        <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
        <input
          type="text"
          className="input-field text-sm"
          value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
          onChange={(e) => {
            if (field.name === 'rules') {
              try {
                updateConfig(ic.type, field.name, JSON.parse(e.target.value));
              } catch {
                updateConfig(ic.type, field.name, e.target.value);
              }
            } else {
              updateConfig(ic.type, field.name, e.target.value);
            }
          }}
        />
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>
          拦截器
          {interceptors.length > 0 && (
            <span className="ml-2 bg-primary-100 text-primary-700 text-xs px-1.5 py-0.5 rounded-full">
              {interceptors.length}
            </span>
          )}
        </span>
        <span className="text-gray-400">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 mt-3 mb-2">
            在每个节点执行前后运行的钩子。
          </p>

          {/* Active interceptors with editable config */}
          {interceptors.map((ic) => {
            const fields = INTERCEPTOR_FIELDS[ic.type] ?? [];
            const isEditing = editingType === ic.type;

            return (
              <div
                key={ic.type}
                className="py-2 px-2 mb-1 bg-gray-50 rounded text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{INTERCEPTOR_LABELS[ic.type] ?? ic.type}</span>
                    <span className="text-xs text-gray-400">
                      {INTERCEPTOR_DESCRIPTIONS[ic.type] ?? ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {fields.length > 0 && (
                      <button
                        className="text-xs text-primary-600 hover:text-primary-700"
                        onClick={() => setEditingType(isEditing ? null : ic.type)}
                      >
                        {isEditing ? '收起' : '配置'}
                      </button>
                    )}
                    <button
                      className="text-red-500 hover:text-red-700 text-xs"
                      onClick={() => removeInterceptor(ic.type)}
                    >
                      移除
                    </button>
                  </div>
                </div>
                {isEditing && fields.length > 0 && (
                  <div className="mt-2 space-y-2 pl-2 border-l-2 border-primary-200">
                    {fields.map((field) => renderField(ic, field))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add interceptor buttons */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INTERCEPTOR_TYPES.filter((t) => !interceptors.some((i) => i.type === t)).map((type) => (
              <button
                key={type}
                className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-primary-400 hover:text-primary-600 transition-colors"
                onClick={() => addInterceptor(type)}
              >
                + {INTERCEPTOR_LABELS[type] ?? type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
