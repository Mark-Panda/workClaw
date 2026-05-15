import type { KanbanBoard } from '../../types/kanban';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface KanbanSlice {
  boards: KanbanBoard[];
  currentBoard: KanbanBoard | null;
  boardsLoading: boolean;
  setBoards: (boards: KanbanBoard[]) => void;
  setCurrentBoard: (board: KanbanBoard | null) => void;
  setBoardsLoading: (loading: boolean) => void;
}

export const createKanbanSlice: StateCreator<AppStore, [], [], KanbanSlice> = (set) => ({
  boards: [],
  currentBoard: null,
  boardsLoading: false,

  setBoards: (boards) => set({ boards }),
  setCurrentBoard: (currentBoard) => set({ currentBoard }),
  setBoardsLoading: (loading) => set({ boardsLoading: loading }),
});
