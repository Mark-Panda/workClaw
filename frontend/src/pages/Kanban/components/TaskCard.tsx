import type { KanbanTask } from '../../../types/kanban';

const priorityColors: Record<string, string> = {
  low: 'bg-gray-200 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function TaskCard({ task }: { task: KanbanTask }) {
  return (
    <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
      <p className="text-sm font-medium mb-2">{task.title}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[task.priority] ?? ''}`}
        >
          {task.priority}
        </span>
        {task.dueDate && (
          <span className="text-xs text-gray-400">
            {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
