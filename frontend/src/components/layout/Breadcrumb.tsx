const labels: Record<string, string> = {
  dashboard: 'Dashboard',
  chat: 'Chat',
  agents: 'Agents',
  rules: 'Rules',
  kanban: 'Kanban',
  logs: 'Logs',
  new: 'New',
};

export default function Breadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500">
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
