import { useStore } from '../../../store';

export default function LogFilter() {
  const { logFilter, setLogFilter } = useStore();

  return (
    <div className="card mb-4 flex flex-wrap gap-3 items-center">
      <select
        value={logFilter.level ?? ''}
        onChange={(e) => setLogFilter({ ...logFilter, level: e.target.value || undefined })}
        className="input-field max-w-[150px]"
      >
        <option value="">All Levels</option>
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>

      <select
        value={logFilter.source ?? ''}
        onChange={(e) => setLogFilter({ ...logFilter, source: e.target.value || undefined })}
        className="input-field max-w-[200px]"
      >
        <option value="">All Sources</option>
        <option value="agent">Agent</option>
        <option value="rule_engine">Rule Engine</option>
        <option value="system">System</option>
        <option value="api">API</option>
      </select>
    </div>
  );
}
