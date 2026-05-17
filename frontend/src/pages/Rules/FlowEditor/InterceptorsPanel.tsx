import { useState } from 'react';
import type { InterceptorConfig } from '../../../types/rule';

interface Props {
  interceptors: InterceptorConfig[];
  onChange: (interceptors: InterceptorConfig[]) => void;
}

const INTERCEPTOR_TYPES = ['logging', 'metrics', 'auth', 'validation'] as const;

const INTERCEPTOR_LABELS: Record<string, string> = {
  logging: 'Logging',
  metrics: 'Metrics',
  auth: 'Auth / Token',
  validation: 'Validation',
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

  const addInterceptor = (type: string) => {
    if (interceptors.some((i) => i.type === type)) return;
    onChange([...interceptors, { type, config: defaultConfig(type) }]);
  };

  const removeInterceptor = (type: string) => {
    onChange(interceptors.filter((i) => i.type !== type));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <span>
          Interceptors
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
            Hooks that run before/after each node execution in the chain.
          </p>

          {/* Active interceptors */}
          {interceptors.map((ic) => (
            <div
              key={ic.type}
              className="flex items-center justify-between py-1.5 px-2 mb-1 bg-gray-50 rounded text-sm"
            >
              <span className="font-medium">{INTERCEPTOR_LABELS[ic.type] ?? ic.type}</span>
              <button
                className="text-red-500 hover:text-red-700 text-xs"
                onClick={() => removeInterceptor(ic.type)}
              >
                Remove
              </button>
            </div>
          ))}

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
