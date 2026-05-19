import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import { showError, showSuccess } from '../../utils/toast';
import * as modelsApi from '../../api/models';
import * as agentsApi from '../../api/agents';

interface ModelOption {
  providerId: string;
  providerName: string;
  providerType: string;
  modelName: string;
}

export default function AgentEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant.');
  const [temperature, setTemperature] = useState(0.7);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const res = await modelsApi.listProviders();
      const opts: ModelOption[] = [];
      for (const p of res.providers) {
        const detail = await modelsApi.getProvider(p.id);
        if (detail.models) {
          for (const m of detail.models) {
            opts.push({ providerId: p.id, providerName: p.name, providerType: p.provider_type, modelName: m.model_name });
          }
        }
      }
      setModelOptions(opts);
      if (opts.length > 0 && !selectedModel) {
        const defaultProvider = res.providers.find((p) => p.is_default);
        const firstOpt = defaultProvider ? opts.find((o) => o.providerId === defaultProvider.id) : undefined;
        const pick = firstOpt || opts[0];
        setSelectedModel(`${pick.providerId}:${pick.modelName}`);
      }
    } catch {
      showError('加载模型列表失败');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);

    if (!name.trim()) {
      setNameError('智能体名称不能为空');
      return;
    }

    const [providerId, modelName] = selectedModel.split(':');
    const config = { provider_id: providerId, model: modelName, systemPrompt, temperature, maxTokens: 4096 };
    try {
      if (isNew) {
        const res = await agentsApi.createAgent({ name: name.trim(), description, config });
        showSuccess('创建成功');
        navigate(`/agents/${res.id}`);
      } else {
        navigate('/agents');
      }
    } catch {
      showError('保存失败，请稍后重试');
    }
  };

  const grouped = modelOptions.reduce<Record<string, { name: string; type: string; models: { modelName: string; key: string }[] }>>((acc, opt) => {
    if (!acc[opt.providerId]) acc[opt.providerId] = { name: opt.providerName, type: opt.providerType, models: [] };
    acc[opt.providerId].models.push({ modelName: opt.modelName, key: `${opt.providerId}:${opt.modelName}` });
    return acc;
  }, {});

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">{isNew ? '新建智能体' : '编辑智能体'}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">基本信息</h2>
          <p className="text-xs text-gray-400">
            技能和 MCP 服务器为全局配置，所有智能体自动共享。请在「技能管理」和「MCP 管理」页面分别管理。
          </p>
          <div>
            <label htmlFor="agent-name" className="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              className={`input-field ${nameError ? 'border-red-400 focus:ring-red-400' : ''}`}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-sm text-red-600 mt-1">{nameError}</p>}
          </div>
          <div>
            <label htmlFor="agent-desc" className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea id="agent-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={3} />
          </div>
          <div>
            <label htmlFor="agent-model" className="block text-sm font-medium text-gray-700 mb-1">模型</label>
            {modelOptions.length === 0 ? (
              <p className="text-sm text-gray-400">暂无可用模型，请先在「模型管理」中添加。</p>
            ) : (
              <select id="agent-model" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="input-field" required>
                <option value="" disabled>请选择模型</option>
                {Object.entries(grouped).map(([pid, group]) => (
                  <optgroup key={pid} label={`${group.name} (${group.type})`}>
                    {group.models.map((m) => <option key={m.key} value={m.key}>{m.modelName}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="agent-prompt" className="block text-sm font-medium text-gray-700 mb-1">系统提示词</label>
            <textarea id="agent-prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="input-field" rows={4} />
          </div>
          <div>
            <label htmlFor="agent-temp" className="block text-sm font-medium text-gray-700 mb-1">温度: {temperature}</label>
            <input id="agent-temp" type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full" />
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit">{isNew ? '创建' : '保存'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/agents')}>取消</Button>
        </div>
      </form>
    </div>
  );
}
