import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: '仪表盘', icon: '◻' },
  { to: '/chat', label: '对话', icon: '◉' },
  { to: '/agents', label: '智能体', icon: '▲' },
  { to: '/rules', label: '规则', icon: '◈' },
  { to: '/kanban', label: '看板', icon: '▣' },
  { to: '/models', label: '模型管理', icon: '◆' },
  { to: '/skills', label: '技能管理', icon: '◇' },
  { to: '/mcp-servers', label: 'MCP管理', icon: '⬡' },
  { to: '/logs', label: '日志', icon: '☰' },
];

export default function Sidebar() {
  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-gray-100">
        <span className="font-bold text-lg text-primary-700">workClaw</span>
      </div>
      <nav className="flex-1 p-3 space-y-1" role="navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <span className="w-5 text-center">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-100 text-xs text-gray-400">
        herness v0.1.0
      </div>
    </aside>
  );
}
