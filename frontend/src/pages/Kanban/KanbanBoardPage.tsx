import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store';
import Button from '../../components/common/Button';
import BoardColumn from './components/BoardColumn';
import TaskEditor from './components/TaskEditor';

export default function KanbanBoardPage() {
  const { boardId } = useParams();
  const { currentBoard } = useStore();
  const [showTaskEditor, setShowTaskEditor] = useState(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  const handleAddTask = (columnId: string) => {
    setSelectedColumnId(columnId);
    setShowTaskEditor(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {currentBoard?.name ?? 'Kanban Board'}
        </h1>
        <Button onClick={() => handleAddTask(currentBoard?.columns[0]?.id ?? '')}>
          Add Task
        </Button>
      </div>

      {!currentBoard || currentBoard.columns.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          No board selected. Select or create a board to start managing tasks.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {currentBoard.columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              onAddTask={() => handleAddTask(column.id)}
            />
          ))}
        </div>
      )}

      {showTaskEditor && selectedColumnId && (
        <TaskEditor
          columnId={selectedColumnId}
          onClose={() => setShowTaskEditor(false)}
        />
      )}
    </div>
  );
}
