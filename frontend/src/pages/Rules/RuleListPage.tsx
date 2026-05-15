import { Link } from 'react-router-dom';
import { useStore } from '../../store';
import Button from '../../components/common/Button';

export default function RuleListPage() {
  const { rules } = useStore();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Rules</h1>
        <Link to="/rules/new">
          <Button>New Rule</Button>
        </Link>
      </div>

      {rules.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          No rule chains yet. Create your first rule chain to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Link
              key={rule.id}
              to={`/rules/${rule.id}`}
              className="card block hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{rule.name}</h3>
                  {rule.description && (
                    <p className="text-sm text-gray-500">{rule.description}</p>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    rule.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : rule.status === 'archived'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {rule.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Nodes: {rule.dsl?.nodes?.length ?? 0} | Version: {rule.version}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
