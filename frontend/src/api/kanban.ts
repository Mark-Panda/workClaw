import client from './client';
import type { KanbanBoard, KanbanTask } from '../types/kanban';

export async function listBoards(): Promise<{ boards: KanbanBoard[] }> {
  const res = await client.get('/kanban/boards');
  return res.data;
}

export async function getBoard(id: string): Promise<KanbanBoard> {
  const res = await client.get(`/kanban/boards/${id}`);
  return res.data;
}

export async function createBoard(data: { name: string; description?: string }): Promise<{ id: string }> {
  const res = await client.post('/kanban/boards', data);
  return res.data;
}

export async function createTask(columnId: string, data: Partial<KanbanTask>): Promise<{ id: string }> {
  const res = await client.post(`/kanban/columns/${columnId}/tasks`, data);
  return res.data;
}

export async function moveTask(taskId: string, targetColumnId: string): Promise<{ moved: boolean }> {
  const res = await client.patch(`/kanban/tasks/${taskId}/move`, { columnId: targetColumnId });
  return res.data;
}
