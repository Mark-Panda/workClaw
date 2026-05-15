import type { LogEntry } from '../../../types/log';
import Pagination from '../../../components/common/Pagination';
import { useStore } from '../../../store';

interface LogTableProps {
  logs: LogEntry[];
  total: number;
}

const levelColors: Record<string, string> = {
  debug: 'text-gray-400',
  info: 'text-blue-600',
  warn: 'text-orange-600',
  error: 'text-red-600',
};

export default function LogTable({ logs, total }: LogTableProps) {
  const { logFilter, setLogFilter } = useStore();

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Time</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Level</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Source</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-400 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </td>
                <td className={`py-2 px-3 font-medium ${levelColors[log.level] ?? ''}`}>
                  {log.level.toUpperCase()}
                </td>
                <td className="py-2 px-3 text-gray-500">{log.source}</td>
                <td className="py-2 px-3">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <Pagination
          page={logFilter.page ?? 1}
          total={total}
          pageSize={logFilter.pageSize ?? 50}
          onPageChange={(page) => setLogFilter({ ...logFilter, page })}
        />
      </div>
    </div>
  );
}
