import { Link } from 'react-router-dom';
import { useStore } from '../../store';
import Button from '../../components/common/Button';

export default function AgentListPage() {
  const { agents } = useStore();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Link to="/agents/new">
          <Button>New Agent</Button>
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          No agents yet. Create your first agent to get started.
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
                Model: {agent.config?.model ?? 'N/A'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
