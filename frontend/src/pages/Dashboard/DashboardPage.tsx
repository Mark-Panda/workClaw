import { Link } from 'react-router-dom';

const cards = [
  { to: '/chat', label: '对话', desc: '流式 AI 对话', color: 'bg-blue-50 text-blue-700' },
  { to: '/agents', label: '智能体', desc: '管理 AI 智能体和技能', color: 'bg-green-50 text-green-700' },
  { to: '/rules', label: '规则', desc: '可视化规则引擎编辑器', color: 'bg-purple-50 text-purple-700' },
  { to: '/kanban', label: '看板', desc: '任务看板与工作流', color: 'bg-orange-50 text-orange-700' },
  { to: '/logs', label: '日志', desc: '系统日志与监控', color: 'bg-gray-100 text-gray-700' },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">仪表盘</h1>
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
