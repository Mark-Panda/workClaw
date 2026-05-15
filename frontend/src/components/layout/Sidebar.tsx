import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: '◻' },
  { to: '/chat', label: 'Chat', icon: '◉' },
  { to: '/agents', label: 'Agents', icon: '▲' },
  { to: '/rules', label: 'Rules', icon: '◈' },
  { to: '/kanban', label: 'Kanban', icon: '▣' },
  { to: '/logs', label: 'Logs', icon: '☰' },
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
