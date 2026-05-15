import { Link } from 'react-router-dom';
import { useStore } from '../../store';
import Button from '../../components/common/Button';

export default function AgentListPage() {
  const { agents } = useStore();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">智能体</h1>
        <Link to="/agents/new">
          <Button>新建智能体</Button>
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          暂无智能体，请点击上方按钮创建。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Link key={agent.id} to={`/agents/${agent.id}`} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{agent.name}</h3>
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    agent.status === 'running'
                      ? 'bg-green-500'
                      : agent.status === 'error'
                        ? 'bg-red-500'
                        : 'bg-gray-300'
                  }`}
                />
              </div>
              {agent.description && (
                <p className="text-sm text-gray-500 line-clamp-2">{agent.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                模型: {agent.config?.model ?? '未设置'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
