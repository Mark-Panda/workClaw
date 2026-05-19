import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import { createRule, updateRule, getRule, toggleRule } from '../../api/rules';
import { useRuleValidation } from '../../hooks/useRuleValidation';
import { FlowEditor, InterceptorsPanel, createDefaultDsl } from './FlowEditor';
import { NodeSelectionContext } from './FlowEditor/nodeSelection';
import { showError, showSuccess } from '../../utils/toast';
import type { RuleChainDsl, InterceptorConfig, RuleChain } from '../../types/rule';
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
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [ruleStatus, setRuleStatus] = useState<RuleChain['status'] | null>(null);
  const [canvasState, setCanvasState] = useState<unknown>(undefined);

  const { validate, validationResult, validating } = useRuleValidation();

  // ── Dirty tracking & leave confirmation ──
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
  }, []);

  // beforeunload: warn when closing/refreshing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Store a snapshot of the initial state to detect real changes
  const initialSnapshot = useRef<string>('');
  const isInitialLoad = useRef(true);

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
          setRuleStatus(rule.status);
          setCanvasState(rule.canvas_state);
          // Capture initial snapshot after load
          initialSnapshot.current = JSON.stringify({
            name: rule.name,
            description: rule.description || '',
            dsl: rule.dsl,
          });
          isInitialLoad.current = false;
        })
        .catch(() => {
          showError('加载规则失败');
          navigate('/rules');
        })
        .finally(() => setLoading(false));
    } else {
      // New rule: capture default snapshot
      initialSnapshot.current = JSON.stringify({ name: '', description: '', dsl: createDefaultDsl() });
      isInitialLoad.current = false;
    }
  }, [id, isNew, navigate]);

  // Check if current state differs from snapshot
  useEffect(() => {
    if (isInitialLoad.current) return;
    const current = JSON.stringify({ name, description, dsl });
    const isDirty = current !== initialSnapshot.current;
    dirtyRef.current = isDirty;
    setDirty(isDirty);
  }, [name, description, dsl]);

  const handleDslChange = useCallback((newDsl: RuleChainDsl) => {
    setDsl((prev) => ({
      ...newDsl,
      interceptors: prev.interceptors,
    }));
  }, []);

  useEffect(() => {
    const merged = { ...dsl, interceptors };
    setDslJson(JSON.stringify(merged, null, 2));
  }, [dsl, interceptors]);

  const handleInterceptorsChange = useCallback(
    (newInterceptors: InterceptorConfig[]) => {
      setInterceptors(newInterceptors);
      const updated = { ...dsl, interceptors: newInterceptors };
      setDsl(updated);
      setDslJson(JSON.stringify(updated, null, 2));
    },
    [dsl],
  );

  const handleModeSwitch = (mode: 'visual' | 'json') => {
    if (mode === 'json') {
      const latest = { ...dsl, interceptors };
      setDslJson(JSON.stringify(latest, null, 2));
      setJsonError(null);
    } else {
      try {
        const parsed = JSON.parse(dslJson);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          setDsl(parsed);
          setInterceptors(parsed.interceptors ?? []);
          setError(null);
          setJsonError(null);
        } else {
          setJsonError('JSON 缺少 nodes 数组');
          return;
        }
      } catch (e) {
        setJsonError('JSON 格式不正确：' + (e instanceof Error ? e.message : '解析错误'));
        return;
      }
    }
    setViewMode(mode);
  };

  const handleViewModeSwitch = useCallback(
    (mode: 'visual' | 'json') => {
      handleModeSwitch(mode);
    },
    [handleModeSwitch],
  );

  const handleSave = async () => {
    setError(null);
    setNameError(null);

    if (!name.trim()) {
      setNameError('规则名称不能为空');
      return;
    }

    const finalDsl: RuleChainDsl = { ...dsl, interceptors };

    const result = await validate(finalDsl);
    if (result && !result.valid) {
      setError('验证失败：' + result.warnings.join(', '));
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const res = await createRule({ name: name.trim(), description, dsl: finalDsl, canvas_state: canvasState });
        showSuccess('创建成功');
        dirtyRef.current = false;
        navigate(`/rules/${res.id}`);
      } else {
        await updateRule(id!, { name: name.trim(), description, dsl: finalDsl, canvas_state: canvasState });
        showSuccess('保存成功');
        dirtyRef.current = false;
        // Update snapshot after save
        initialSnapshot.current = JSON.stringify({ name: name.trim(), description, dsl: finalDsl });
        setDirty(false);
      }
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (enable: boolean) => {
    if (!id) return;
    setToggling(true);
    try {
      const result = await toggleRule(id, enable);
      setRuleStatus(result.status as RuleChain['status']);
      showSuccess(enable ? '已启用' : '已禁用');
    } catch {
      showError('操作失败，请稍后重试');
    } finally {
      setToggling(false);
    }
  };

  // Navigate with dirty check
  const navigateWithCheck = useCallback((to: string) => {
    if (dirtyRef.current) {
      if (!window.confirm('有未保存的更改，确定要离开吗？')) return;
    }
    navigate(to);
  }, [navigate]);

  const statusLabel = (status: string | null) => {
    switch (status) {
      case 'enabled': return '已启用';
      case 'disabled': return '已禁用';
      case 'archived': return '已归档';
      default: return '草稿';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {isNew ? '新建规则' : '编辑规则'}
          </h1>
          {!isNew && ruleStatus && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              ruleStatus === 'enabled'
                ? 'bg-green-100 text-green-700'
                : ruleStatus === 'disabled'
                  ? 'bg-red-100 text-red-700'
                  : ruleStatus === 'archived'
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-yellow-100 text-yellow-700'
            }`}>
              {statusLabel(ruleStatus)}
            </span>
          )}
          {dirty && <span className="text-xs text-gray-400">（未保存）</span>}
        </div>
        <div className="flex gap-3">
          {!isNew && ruleStatus === 'draft' && (
            <Button
              variant="primary"
              disabled={saving || toggling}
              onClick={() => handleToggle(true)}
            >
              {toggling ? '处理中…' : '发布'}
            </Button>
          )}
          {!isNew && (ruleStatus === 'enabled' || ruleStatus === 'disabled') && (
            <Button
              variant={ruleStatus === 'enabled' ? 'danger' : 'primary'}
              disabled={saving || toggling}
              onClick={() => handleToggle(ruleStatus !== 'enabled')}
            >
              {toggling ? '处理中…' : ruleStatus === 'enabled' ? '禁用' : '启用'}
            </Button>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => handleModeSwitch('visual')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'visual'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white hover:bg-gray-50'
              }`}
              aria-label="可视化编辑模式"
            >
              可视化
            </button>
            <button
              onClick={() => handleModeSwitch('json')}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'json'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white hover:bg-gray-50'
              }`}
              aria-label="JSON编辑模式"
            >
              JSON
            </button>
          </div>
          <Button onClick={handleSave} disabled={saving || validating}>
            {saving ? '保存中…' : isNew ? '创建' : '保存'}
          </Button>
          <Button variant="secondary" onClick={() => navigateWithCheck('/rules')}>
            取消
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0" role="alert">
          {error}
        </div>
      )}
      {validationResult && !validationResult.valid && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm flex-shrink-0" role="alert">
          {validationResult.warnings?.map((w: string, i: number) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
      {jsonError && viewMode === 'json' && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0" role="alert">
          {jsonError}
        </div>
      )}

      <div className="mb-3 flex-shrink-0">
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="规则链名称（必填）"
            className={`input-field max-w-md ${nameError ? 'border-red-400 focus:ring-red-400' : ''}`}
            aria-label="规则链名称"
            aria-invalid={!!nameError}
          />
          {nameError && <p className="text-sm text-red-600 mt-1">{nameError}</p>}
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述（可选）"
          className="input-field max-w-md mt-2"
          aria-label="规则描述"
        />
      </div>

      <NodeSelectionContext.Provider value={{ selectedNode, setSelectedNode }}>
      <div className="flex-1 min-h-0 flex gap-3">
        <div className="flex-1 min-w-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
          <FlowEditor
            dsl={dsl}
            onChange={handleDslChange}
            viewMode={viewMode}
            onViewModeSwitch={handleViewModeSwitch}
            canvasState={canvasState}
            onCanvasStateChange={setCanvasState}
          />
        </div>
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
