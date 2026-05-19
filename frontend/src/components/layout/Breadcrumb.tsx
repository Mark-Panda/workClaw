const labels: Record<string, string> = {
  dashboard: '仪表盘',
  chat: '对话',
  agents: '智能体',
  rules: '规则',
  kanban: '看板',
  logs: '日志',
  models: '模型管理',
  skills: '技能管理',
  'mcp-servers': 'MCP 管理',
  new: '新建',
};

export default function Breadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500" aria-label="面包屑导航">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const label = labels[seg] || seg;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">/</span>}
            <span className={isLast ? 'text-gray-900 font-medium' : ''}>
              {label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
