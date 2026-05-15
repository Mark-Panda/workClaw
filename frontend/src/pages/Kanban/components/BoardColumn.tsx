import type { KanbanColumn } from '../../../types/kanban';
import TaskCard from './TaskCard';

interface BoardColumnProps {
  column: KanbanColumn;
  onAddTask: () => void;
}

export default function BoardColumn({ column, onAddTask }: BoardColumnProps) {
  return (
    <div className="flex-shrink-0 w-72">
      <div
        className="px-3 py-2 rounded-t-lg flex items-center justify-between"
        style={{ backgroundColor: column.color + '20' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <span className="font-medium text-sm">{column.name}</span>
          <span className="text-xs text-gray-400">{column.tasks?.length ?? 0}</span>
        </div>
        <button
          onClick={onAddTask}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          title="Add task"
        >
          +
        </button>
      </div>
      <div className="bg-gray-50 rounded-b-lg p-2 min-h-[200px] space-y-2">
        {column.tasks?.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {(!column.tasks || column.tasks.length === 0) && (
          <p className="text-center text-gray-400 text-sm py-4">No tasks</p>
        )}
      </div>
    </div>
  );
}
