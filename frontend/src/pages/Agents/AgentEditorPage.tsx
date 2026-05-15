import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import * as modelsApi from '../../api/models';
import type { LlmProvider, LlmModel } from '../../types/models';

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
            opts.push({
              providerId: p.id,
              providerName: p.name,
              providerType: p.provider_type,
              modelName: m.model_name,
            });
          }
        }
      }
      setModelOptions(opts);
      if (opts.length > 0 && !selectedModel) {
        // Try to find a model from default provider first, then fall back to first option
        const defaultProvider = res.providers.find((p) => p.is_default);
        const firstOpt = defaultProvider
          ? opts.find((o) => o.providerId === defaultProvider.id)
          : undefined;
        const pick = firstOpt || opts[0];
        setSelectedModel(`${pick.providerId}:${pick.modelName}`);
      }
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const [providerId, modelName] = selectedModel.split(':');
    const config = {
      provider_id: providerId,
      model: modelName,
      system_prompt: systemPrompt,
      temperature,
    };
    // TODO: Create/update agent via API with config
    console.log('Agent config:', config);
    navigate('/agents');
  };

  // Group options by provider
  const grouped = modelOptions.reduce<Record<string, { name: string; type: string; models: { modelName: string; key: string }[] }>>((acc, opt) => {
    if (!acc[opt.providerId]) {
      acc[opt.providerId] = { name: opt.providerName, type: opt.providerType, models: [] };
    }
    acc[opt.providerId].models.push({ modelName: opt.modelName, key: `${opt.providerId}:${opt.modelName}` });
    return acc;
  }, {});

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">
        {isNew ? '新建智能体' : '编辑智能体'}
      </h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
          {modelOptions.length === 0 ? (
            <p className="text-sm text-gray-400">
              暂无可用模型，请先在「模型管理」中添加 Provider 和模型。
            </p>
          ) : (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="input-field"
              required
            >
              <option value="" disabled>请选择模型</option>
              {Object.entries(grouped).map(([providerId, group]) => (
                <optgroup key={providerId} label={`${group.name} (${group.type})`}>
                  {group.models.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.modelName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">系统提示词</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="input-field"
            rows={4}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            温度: {temperature}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit">{isNew ? '创建' : '保存'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/agents')}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
