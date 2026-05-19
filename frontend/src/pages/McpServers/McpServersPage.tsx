import { useState, useEffect, useCallback } from 'react';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { showError, showSuccess } from '../../utils/toast';
import * as mcpApi from '../../api/mcp-servers';
import type { McpServerItem, CreateMcpServerRequest, UpdateMcpServerRequest } from '../../api/mcp-servers';

const EMPTY_FORM: CreateMcpServerRequest = {
  name: '',
  transport: 'stdio',
  command: '',
  args_json: '',
  url: '',
  env_json: '',
  enabled: true,
};

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateMcpServerRequest>({ ...EMPTY_FORM });
  const [nameError, setNameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mcpApi.listMcpServers();
      setServers(res.mcp_servers);
    } catch {
      showError('加载 MCP 列表失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setNameError(null);
    setModal(true);
  };

  const openEdit = (s: McpServerItem) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      transport: s.transport,
      command: s.command ?? '',
      args_json: s.args_json ?? '',
      url: s.url ?? '',
      env_json: s.env_json ?? '',
      enabled: s.enabled,
    });
    setNameError(null);
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setNameError('名称不能为空');
      return;
    }
    setNameError(null);
    try {
      if (editingId) {
        const data: UpdateMcpServerRequest = {};
        if (form.name !== (servers.find((s) => s.id === editingId)?.name ?? ''))
          data.name = form.name;
        if (form.transport !== (servers.find((s) => s.id === editingId)?.transport ?? ''))
          data.transport = form.transport;
        data.command = form.command || undefined;
        data.args_json = form.args_json || undefined;
        data.url = form.url || undefined;
        data.env_json = form.env_json || undefined;
        const current = servers.find((s) => s.id === editingId);
        if (form.enabled !== (current?.enabled ?? true)) data.enabled = form.enabled;
        await mcpApi.updateMcpServer(editingId, data);
      } else {
        await mcpApi.createMcpServer({
          ...form,
          command: form.command || undefined,
          args_json: form.args_json || undefined,
          url: form.url || undefined,
          env_json: form.env_json || undefined,
        });
      }
      showSuccess('保存成功');
      setModal(false);
      loadServers();
    } catch {
      showError('保存失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mcpApi.deleteMcpServer(deleteTarget.id);
      showSuccess('删除成功');
    } catch {
      showError('删除失败');
    }
    setDeleteTarget(null);
    loadServers();
  };

  const transportLabel = (t: string) => (t === 'stdio' ? 'STDIO' : 'SSE');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">MCP 管理</h1>
        <Button onClick={openNew}>新增 MCP Server</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : servers.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          尚未配置 MCP Server，请点击上方按钮添加。
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((s) => (
            <div key={s.id} className="card flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {transportLabel(s.transport)}
                  </span>
                  {s.enabled ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                      启用
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                      禁用
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {s.transport === 'stdio' && s.command
                    ? `命令: ${s.command}`
                    : s.url
                      ? `URL: ${s.url}`
                      : '未配置'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1"
                  onClick={() => openEdit(s)}
                >
                  编辑
                </button>
                <button
                  className="text-xs text-gray-400 hover:text-red-600 px-2 py-1"
                  onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editingId ? '编辑 MCP Server' : '新增 MCP Server'}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="mcp-name" className="block text-sm font-medium text-gray-700 mb-1">名称</label>
            <input
              id="mcp-name"
              className={`input-field ${nameError ? 'border-red-400' : ''}`}
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (nameError) setNameError(null);
              }}
              placeholder="例如：filesystem、github"
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-sm text-red-600 mt-1">{nameError}</p>}
          </div>
          <div>
            <label htmlFor="mcp-transport" className="block text-sm font-medium text-gray-700 mb-1">传输方式</label>
            <select
              id="mcp-transport"
              className="input-field"
              value={form.transport}
              onChange={(e) => setForm({ ...form, transport: e.target.value })}
            >
              <option value="stdio">STDIO</option>
              <option value="sse">SSE</option>
            </select>
          </div>

          {form.transport === 'stdio' ? (
            <>
              <div>
                <label htmlFor="mcp-command" className="block text-sm font-medium text-gray-700 mb-1">命令</label>
                <input
                  id="mcp-command"
                  className="input-field"
                  value={form.command ?? ''}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="例如：npx、uvx"
                />
              </div>
              <div>
                <label htmlFor="mcp-args" className="block text-sm font-medium text-gray-700 mb-1">
                  参数 (JSON) <span className="text-gray-400 font-normal">(可选)</span>
                </label>
                <input
                  id="mcp-args"
                  className="input-field"
                  value={form.args_json ?? ''}
                  onChange={(e) => setForm({ ...form, args_json: e.target.value })}
                  placeholder='例如：["-y","@anthropic/mcp-server-filesystem"]'
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="mcp-url" className="block text-sm font-medium text-gray-700 mb-1">SSE URL</label>
              <input
                id="mcp-url"
                className="input-field"
                value={form.url ?? ''}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="例如：https://mcp.example.com/sse"
              />
            </div>
          )}

          <div>
            <label htmlFor="mcp-env" className="block text-sm font-medium text-gray-700 mb-1">
              环境变量 (JSON) <span className="text-gray-400 font-normal">(可选)</span>
            </label>
            <input
              id="mcp-env"
              className="input-field"
              value={form.env_json ?? ''}
              onChange={(e) => setForm({ ...form, env_json: e.target.value })}
              placeholder='例如：{"API_KEY":"xxx"}'
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            启用
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setModal(false)}>取消</Button>
            <Button onClick={save}>保存</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除 MCP Server"
        message={`确定要删除 MCP Server「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
      />
    </div>
  );
}
