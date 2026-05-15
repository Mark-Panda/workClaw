import { useState, useEffect, useCallback } from 'react';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import * as modelsApi from '../../api/models';
import type {
  LlmProvider,
  LlmModel,
  CreateProviderRequest,
  UpdateProviderRequest,
  AddModelRequest,
  UpdateModelRequest,
} from '../../types/models';

const EMPTY_PROVIDER: CreateProviderRequest = {
  name: '',
  provider_type: 'anthropic',
  base_url: '',
  api_key: '',
  is_default: false,
};

const EMPTY_MODEL: AddModelRequest = {
  model_name: '',
  display_name: '',
  max_tokens: 4096,
  temperature: 0.7,
  is_default: false,
};

export default function ModelManagementPage() {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [providerModal, setProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LlmProvider | null>(null);
  const [providerForm, setProviderForm] = useState<CreateProviderRequest>({ ...EMPTY_PROVIDER });

  const [modelModal, setModelModal] = useState(false);
  const [modelProviderId, setModelProviderId] = useState('');
  const [editingModel, setEditingModel] = useState<LlmModel | null>(null);
  const [modelForm, setModelForm] = useState<AddModelRequest>({ ...EMPTY_MODEL });

  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'provider'; id: string; name: string } | { kind: 'model'; id: string; name: string } | null
  >(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await modelsApi.listProviders();
      setProviders(res.providers);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    try {
      const detail = await modelsApi.getProvider(id);
      setProviders((prev) =>
        prev.map((p) => (p.id === id ? { ...p, models: detail.models } : p)),
      );
    } catch {
      /* ignore */
    }
  };

  const openNewProvider = () => {
    setEditingProvider(null);
    setProviderForm({ ...EMPTY_PROVIDER });
    setProviderModal(true);
  };

  const openEditProvider = (p: LlmProvider) => {
    setEditingProvider(p);
    setProviderForm({
      name: p.name,
      provider_type: p.provider_type,
      base_url: p.base_url ?? '',
      api_key: p.api_key,
      is_default: p.is_default,
    });
    setProviderModal(true);
  };

  const saveProvider = async () => {
    if (!providerForm.name.trim()) return;
    if (editingProvider) {
      const data: UpdateProviderRequest = {};
      if (providerForm.name !== editingProvider.name) data.name = providerForm.name;
      if (providerForm.provider_type !== editingProvider.provider_type)
        data.provider_type = providerForm.provider_type;
      if ((providerForm.base_url ?? '') !== (editingProvider.base_url ?? ''))
        data.base_url = providerForm.base_url || '';
      if (providerForm.api_key !== editingProvider.api_key)
        data.api_key = providerForm.api_key;
      if (providerForm.is_default !== editingProvider.is_default)
        data.is_default = providerForm.is_default;
      await modelsApi.updateProvider(editingProvider.id, data);
    } else {
      await modelsApi.createProvider(providerForm);
    }
    setProviderModal(false);
    loadProviders();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'provider') {
      modelsApi.deleteProvider(deleteTarget.id).then(() => {
        if (expandedId === deleteTarget.id) setExpandedId(null);
        loadProviders();
      });
    } else {
      modelsApi.deleteModel(deleteTarget.id).then(() => {
        if (expandedId) handleExpand(expandedId);
      });
    }
    setDeleteTarget(null);
  };

  const openNewModel = (providerId: string) => {
    setEditingModel(null);
    setModelProviderId(providerId);
    setModelForm({ ...EMPTY_MODEL });
    setModelModal(true);
  };

  const openEditModel = (providerId: string, m: LlmModel) => {
    setEditingModel(m);
    setModelProviderId(providerId);
    setModelForm({
      model_name: m.model_name,
      display_name: m.display_name ?? '',
      max_tokens: m.max_tokens,
      temperature: m.temperature,
      is_default: m.is_default,
    });
    setModelModal(true);
  };

  const saveModel = async () => {
    if (!modelForm.model_name.trim()) return;
    if (editingModel) {
      const data: UpdateModelRequest = {};
      if (modelForm.model_name !== editingModel.model_name)
        data.model_name = modelForm.model_name;
      if ((modelForm.display_name ?? '') !== (editingModel.display_name ?? ''))
        data.display_name = modelForm.display_name || '';
      if (modelForm.max_tokens !== editingModel.max_tokens)
        data.max_tokens = modelForm.max_tokens;
      if (modelForm.temperature !== editingModel.temperature)
        data.temperature = modelForm.temperature;
      if (modelForm.is_default !== editingModel.is_default)
        data.is_default = modelForm.is_default;
      await modelsApi.updateModel(editingModel.id, data);
    } else {
      await modelsApi.addModel(modelProviderId, modelForm);
    }
    setModelModal(false);
    if (expandedId) handleExpand(expandedId);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">模型管理</h1>
        <Button onClick={openNewProvider}>新增 Provider</Button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">加载中...</div>
      ) : providers.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          尚未配置 LLM Provider，请点击上方按钮添加。
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-center justify-between">
                <button
                  className="flex-1 text-left flex items-center gap-3"
                  onClick={() => handleExpand(p.id)}
                >
                  <span className="text-xs text-gray-400">
                    {expandedId === p.id ? '▼' : '▶'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {p.provider_type}
                      </span>
                      {p.is_default && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          默认
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.base_url ? p.base_url : '默认端点'} · {p.model_count ?? 0} 个模型
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1"
                    onClick={() => openEditProvider(p)}
                  >
                    编辑
                  </button>
                  <button
                    className="text-xs text-gray-400 hover:text-red-600 px-2 py-1"
                    onClick={() =>
                      setDeleteTarget({ kind: 'provider', id: p.id, name: p.name })
                    }
                  >
                    删除
                  </button>
                </div>
              </div>

              {expandedId === p.id && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">模型列表</span>
                    <Button onClick={() => openNewModel(p.id)}>添加模型</Button>
                  </div>
                  {!p.models || p.models.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      该 Provider 下暂无模型。
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {p.models.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-md"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{m.model_name}</span>
                              {m.display_name && (
                                <span className="text-xs text-gray-400">
                                  ({m.display_name})
                                </span>
                              )}
                              {m.is_default && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                  默认
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              最大 Token: {m.max_tokens} · 温度: {m.temperature}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1"
                              onClick={() => openEditModel(p.id, m)}
                            >
                              编辑
                            </button>
                            <button
                              className="text-xs text-gray-400 hover:text-red-600 px-2 py-1"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: 'model',
                                  id: m.id,
                                  name: m.model_name,
                                })
                              }
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Provider 弹窗 */}
      <Modal
        open={providerModal}
        onClose={() => setProviderModal(false)}
        title={editingProvider ? '编辑 Provider' : '新增 Provider'}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <input
              className="input-field"
              value={providerForm.name}
              onChange={(e) =>
                setProviderForm({ ...providerForm, name: e.target.value })
              }
              placeholder="例如：Anthropic、OpenAI"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
            <select
              className="input-field"
              value={providerForm.provider_type}
              onChange={(e) =>
                setProviderForm({ ...providerForm, provider_type: e.target.value })
              }
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              接口地址 <span className="text-gray-400 font-normal">(可选)</span>
            </label>
            <input
              className="input-field"
              value={providerForm.base_url ?? ''}
              onChange={(e) =>
                setProviderForm({ ...providerForm, base_url: e.target.value || undefined })
              }
              placeholder="留空使用默认端点"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              className="input-field"
              type="password"
              value={providerForm.api_key ?? ''}
              onChange={(e) =>
                setProviderForm({ ...providerForm, api_key: e.target.value })
              }
              placeholder="sk-..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={providerForm.is_default}
              onChange={(e) =>
                setProviderForm({ ...providerForm, is_default: e.target.checked })
              }
            />
            设为默认 Provider
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setProviderModal(false)}>取消</Button>
            <Button onClick={saveProvider}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* 模型弹窗 */}
      <Modal
        open={modelModal}
        onClose={() => setModelModal(false)}
        title={editingModel ? '编辑模型' : '添加模型'}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模型名称</label>
            <input
              className="input-field"
              value={modelForm.model_name}
              onChange={(e) =>
                setModelForm({ ...modelForm, model_name: e.target.value })
              }
              placeholder="例如：claude-sonnet-4-6、gpt-4o"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              显示名称 <span className="text-gray-400 font-normal">(可选)</span>
            </label>
            <input
              className="input-field"
              value={modelForm.display_name ?? ''}
              onChange={(e) =>
                setModelForm({ ...modelForm, display_name: e.target.value || undefined })
              }
              placeholder="便于识别的别名"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最大 Token</label>
              <input
                className="input-field"
                type="number"
                value={modelForm.max_tokens}
                onChange={(e) =>
                  setModelForm({ ...modelForm, max_tokens: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">温度</label>
              <input
                className="input-field"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={modelForm.temperature}
                onChange={(e) =>
                  setModelForm({ ...modelForm, temperature: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={modelForm.is_default}
              onChange={(e) =>
                setModelForm({ ...modelForm, is_default: e.target.checked })
              }
            />
            设为该 Provider 默认模型
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setModelModal(false)}>取消</Button>
            <Button onClick={saveModel}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={deleteTarget?.kind === 'provider' ? '删除 Provider' : '删除模型'}
        message={`确定要删除「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
      />
    </div>
  );
}
