import { useEffect, useRef } from 'react';
import { useStore } from '../../../store';

export default function LogStream() {
  const { logs, appendLog } = useStore();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/logs/stream');
    eventSourceRef.current = es;

    es.addEventListener('log', (event) => {
      try {
        const log = JSON.parse(event.data);
        appendLog(log);
      } catch {
        // Skip unparseable events
      }
    });

    es.onerror = () => {
      // Reconnect automatically handled by EventSource
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [appendLog]);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm text-gray-500">Live streaming...</span>
      </div>
      <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-[500px] overflow-auto">
        {logs.slice(0, 100).map((log) => (
          <div key={log.id} className="py-0.5">
            <span className="text-gray-500">{new Date(log.createdAt).toLocaleTimeString()}</span>{' '}
            <span className="text-yellow-400">[{log.level.toUpperCase()}]</span>{' '}
            <span className="text-blue-400">[{log.source}]</span>{' '}
            {log.message}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-500">Waiting for log events...</div>
        )}
      </div>
    </div>
  );
}
