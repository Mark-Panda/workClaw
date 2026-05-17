import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import { createRule, updateRule, getRule } from '../../api/rules';
import { useRuleValidation } from '../../hooks/useRuleValidation';
import { FlowEditor, InterceptorsPanel, createDefaultDsl } from './FlowEditor';
import { NodeSelectionContext } from './FlowEditor/nodeSelection';
import type { RuleChainDsl, InterceptorConfig } from '../../types/rule';
import type { SelectedNodeInfo } from './FlowEditor/nodeSelection';

const DEFAULT_DSL_JSON = JSON.stringify(createDefaultDsl(), null, 2);

export default function RuleEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dsl, setDsl] = useState<RuleChainDsl>(createDefaultDsl());
  const [dslJson, setDslJson] = useState(DEFAULT_DSL_JSON);
  const [interceptors, setInterceptors] = useState<InterceptorConfig[]>([]);
  const [viewMode, setViewMode] = useState<'visual' | 'json'>('visual');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { validate, validationResult, validating } = useRuleValidation();

  // Load existing rule on edit
  useEffect(() => {
    if (!isNew && id) {
      setLoading(true);
      getRule(id)
        .then((rule) => {
          setName(rule.name);
          setDescription(rule.description || '');
          setDsl(rule.dsl);
          setDslJson(JSON.stringify(rule.dsl, null, 2));
          setInterceptors(rule.dsl.interceptors ?? []);
        })
        .catch(() => {
          setError('Failed to load rule');
          navigate('/rules');
        })
        .finally(() => setLoading(false));
    }
  }, [id, isNew, navigate]);

  // Handle DSL changes from the FlowEditor canvas
  const handleDslChange = useCallback((newDsl: RuleChainDsl) => {
    // Preserve interceptors from state since the canvas doesn't manage them
    setDsl((prev) => ({
      ...newDsl,
      interceptors: prev.interceptors,
    }));
  }, []);

  // Keep dslJson in sync with dsl (no side effects inside state updaters)
  useEffect(() => {
    const merged = { ...dsl, interceptors };
    setDslJson(JSON.stringify(merged, null, 2));
  }, [dsl, interceptors]);

  // Handle interceptors changes
  const handleInterceptorsChange = useCallback(
    (newInterceptors: InterceptorConfig[]) => {
      setInterceptors(newInterceptors);
      const updated = { ...dsl, interceptors: newInterceptors };
      setDsl(updated);
      setDslJson(JSON.stringify(updated, null, 2));
    },
    [dsl],
  );

  // Switch between visual and JSON mode
  const handleModeSwitch = (mode: 'visual' | 'json') => {
    if (mode === 'json') {
      // Sync latest DSL (with interceptors) to JSON before switching
      const latest = { ...dsl, interceptors };
      setDslJson(JSON.stringify(latest, null, 2));
    } else {
      // Parse JSON back to DSL
      try {
        const parsed = JSON.parse(dslJson);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          setDsl(parsed);
          setInterceptors(parsed.interceptors ?? []);
          setError(null);
        }
      } catch {
        setError('Cannot switch to Visual mode: invalid JSON in editor');
        return;
      }
    }
    setViewMode(mode);
  };

  // Pass view-mode switch down to the FlowEditor's built-in toolbar
  const handleViewModeSwitch = useCallback(
    (mode: 'visual' | 'json') => {
      handleModeSwitch(mode);
    },
    [handleModeSwitch],
  );

  const handleSave = async () => {
    setError(null);

    // Use the final DSL with interceptors
    const finalDsl: RuleChainDsl = { ...dsl, interceptors };

    // Validate DSL structure via API
    const result = await validate(finalDsl);
    if (result && !result.valid) {
      setError('Validation failed: ' + result.warnings.join(', '));
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const res = await createRule({ name, description, dsl: finalDsl });
        navigate(`/rules/${res.id}`);
      } else {
        await updateRule(id!, { name, description, dsl: finalDsl });
        navigate('/rules');
      }
    } catch {
      setError('Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card text-center text-gray-400 py-12">Loading rule...</div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold">
          {isNew ? 'New Rule' : 'Edit Rule'}
        </h1>
        <div className="flex gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => handleModeSwitch('visual')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'visual'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white hover:bg-gray-50'
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => handleModeSwitch('json')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'json'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white hover:bg-gray-50'
              }`}
            >
              JSON
            </button>
          </div>
          <Button onClick={handleSave} disabled={saving || validating}>
            {saving ? 'Saving...' : isNew ? 'Create' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/rules')}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Error / validation display */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0">
          {error}
        </div>
      )}
      {validationResult && !validationResult.valid && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm flex-shrink-0">
          {validationResult.warnings?.map((w: string, i: number) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {/* Name & description */}
      <div className="mb-3 flex-shrink-0">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule chain name"
          className="input-field max-w-md"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="input-field max-w-md mt-2"
        />
      </div>

      {/* Editor area */}
      <NodeSelectionContext.Provider value={{ selectedNode, setSelectedNode }}>
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Canvas (always mounts FlowEditor; internal view mode toggling) */}
        <div className="flex-1 min-w-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
          <FlowEditor
            dsl={dsl}
            onChange={handleDslChange}
            viewMode={viewMode}
            onViewModeSwitch={handleViewModeSwitch}
          />
        </div>
        {/* Interceptors sidebar (only visible in visual mode) */}
        {viewMode === 'visual' && (
          <div className="w-56 flex-shrink-0">
            <InterceptorsPanel
              interceptors={interceptors}
              onChange={handleInterceptorsChange}
            />
          </div>
        )}
      </div>
      </NodeSelectionContext.Provider>
    </div>
  );
}
