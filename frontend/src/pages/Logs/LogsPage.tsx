import { useState } from 'react';
import { useStore } from '../../store';
import LogFilter from './components/LogFilter';
import LogTable from './components/LogTable';
import LogStream from './components/LogStream';
import type { LogEntry } from '../../types/log';

export default function LogsPage() {
  const { logs, logsTotal, logFilter } = useStore();
  const [showLiveStream, setShowLiveStream] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Logs</h1>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showLiveStream}
            onChange={(e) => setShowLiveStream(e.target.checked)}
            className="rounded"
          />
          Live Stream
        </label>
      </div>

      <LogFilter />

      {showLiveStream ? (
        <LogStream />
      ) : (
        <>
          <LogTable logs={logs} total={logsTotal} />
          {logs.length === 0 && (
            <div className="card text-center text-gray-400 py-12 mt-4">
              No log entries found.
            </div>
          )}
        </>
      )}
    </div>
  );
}
