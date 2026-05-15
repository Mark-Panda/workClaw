export interface KanbanBoard {
  id: string;
  name: string;
  description?: string;
  columns: KanbanColumn[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  boardId: string;
  name: string;
  position: number;
  color: string;
  wipLimit?: number;
  tasks: KanbanTask[];
}

export interface KanbanTask {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  labels?: string[];
  dueDate?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}
