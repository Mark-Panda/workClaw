import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import Spinner from '../../components/common/Spinner';
import { listRules, deleteRule, toggleRule } from '../../api/rules';
import { showError, showSuccess } from '../../utils/toast';
import type { RuleChain } from '../../types/rule';

const PAGE_SIZE = 20;

export default function RuleListPage() {
  const [rules, setRules] = useState<RuleChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  const loadRules = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await listRules({ page: p, page_size: PAGE_SIZE });
      setRules(data.rules);
      setTotal(data.total);
    } catch {
      showError('加载规则列表失败');
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules(page);
  }, [page, loadRules]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确认删除规则「${name}」？此操作不可撤销。`)) return;
    setDeleting(id);
    try {
      await deleteRule(id);
      showSuccess('删除成功');
      loadRules(page);
    } catch {
      showError('删除失败，请稍后重试');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (rule: RuleChain) => {
    const enable = rule.status !== 'enabled';
    setToggling(rule.id);
    try {
      const result = await toggleRule(rule.id, enable);
      setRules(rules.map((r) =>
        r.id === rule.id ? { ...r, status: result.status as RuleChain['status'] } : r,
      ));
      showSuccess(enable ? '已启用' : '已禁用');
    } catch {
      showError('操作失败，请稍后重试');
    } finally {
      setToggling(null);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'enabled': return '已启用';
      case 'disabled': return '已禁用';
      case 'archived': return '已归档';
      default: return '草稿';
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case 'enabled': return 'bg-green-100 text-green-700';
      case 'disabled': return 'bg-red-100 text-red-700';
      case 'archived': return 'bg-gray-100 text-gray-500';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  };

  const filtered = rules.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">规则链</h1>
        <Link to="/rules/new">
          <Button>新建规则</Button>
        </Link>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索规则名称…"
          className="input-field max-w-sm"
          aria-label="搜索规则名称"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          {search ? '未找到匹配的规则。' : '暂无规则链，点击上方按钮创建。'}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {filtered.map((rule) => (
              <div
                key={rule.id}
                className="card flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/rules/${rule.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/rules/${rule.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{rule.name || '(未命名)'}</h3>
                  {rule.description && (
                    <p className="text-sm text-gray-500 truncate mt-0.5">{rule.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    节点: {rule.dsl?.nodes?.length ?? 0}
                    &nbsp;|&nbsp; 版本: {rule.version}
                    &nbsp;|&nbsp; 更新于 {new Date(rule.updated_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${statusClass(rule.status)}`}>
                    {statusLabel(rule.status)}
                  </span>
                  {(rule.status === 'enabled' || rule.status === 'disabled') && (
                    <Button
                      variant={rule.status === 'enabled' ? 'secondary' : 'primary'}
                      size="sm"
                      disabled={toggling === rule.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(rule);
                      }}
                    >
                      {toggling === rule.id ? '处理中…' : rule.status === 'enabled' ? '禁用' : '启用'}
                    </Button>
                  )}
                  {rule.status === 'draft' && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={toggling === rule.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(rule);
                      }}
                    >
                      {toggling === rule.id ? '处理中…' : '发布'}
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={deleting === rule.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(rule.id, rule.name);
                    }}
                  >
                    {deleting === rule.id ? '删除中…' : '删除'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </Button>
              <span className="text-sm text-gray-500">
                第 {page} / {totalPages} 页（共 {total} 条）
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
