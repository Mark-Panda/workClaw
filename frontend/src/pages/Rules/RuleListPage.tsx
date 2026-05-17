import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import Button from '../../components/common/Button';
import { listRules, deleteRule } from '../../api/rules';

export default function RuleListPage() {
  const { rules, rulesLoading, setRules, setRulesLoading } = useStore();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setRulesLoading(true);
    listRules()
      .then((data) => setRules(data.rules))
      .catch(() => setRules([]))
      .finally(() => setRulesLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确认删除规则「${name}」？此操作不可撤销。`)) return;
    setDeleting(id);
    try {
      await deleteRule(id);
      setRules(rules.filter((r) => r.id !== id));
    } catch {
      alert('删除失败，请稍后重试');
    } finally {
      setDeleting(null);
    }
  };

  const filtered = rules.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">规则链</h1>
        <Link to="/rules/new">
          <Button>新建规则</Button>
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索规则名称…"
          className="input-field max-w-sm"
        />
      </div>

      {/* List */}
      {rulesLoading ? (
        <div className="card text-center text-gray-400 py-12">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          {search ? '未找到匹配的规则。' : '暂无规则链，点击上方按钮创建。'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rule) => (
            <div
              key={rule.id}
              className="card flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/rules/${rule.id}`)}
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
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    rule.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : rule.status === 'archived'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {rule.status === 'draft' ? '草稿' : rule.status === 'active' ? '激活' : '归档'}
                </span>
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
      )}
    </div>
  );
}
