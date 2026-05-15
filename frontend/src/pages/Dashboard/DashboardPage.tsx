import { Link } from 'react-router-dom';

const cards = [
  { to: '/chat', label: 'Chat', desc: 'Streaming AI conversations', color: 'bg-blue-50 text-blue-700' },
  { to: '/agents', label: 'Agents', desc: 'Manage AI agents and skills', color: 'bg-green-50 text-green-700' },
  { to: '/rules', label: 'Rules', desc: 'Visual rule engine editor', color: 'bg-purple-50 text-purple-700' },
  { to: '/kanban', label: 'Kanban', desc: 'Task boards and workflows', color: 'bg-orange-50 text-orange-700' },
  { to: '/logs', label: 'Logs', desc: 'System logs and monitoring', color: 'bg-gray-100 text-gray-700' },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className="card hover:shadow-md transition-shadow">
            <div className={`inline-block px-2 py-1 rounded text-sm font-medium mb-2 ${card.color}`}>
              {card.label}
            </div>
            <p className="text-gray-600 text-sm">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
