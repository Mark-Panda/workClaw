import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthSlice } from './slices/authSlice';
import type { AgentSlice } from './slices/agentSlice';
import type { ChatSlice } from './slices/chatSlice';
import type { KanbanSlice } from './slices/kanbanSlice';
import type { LogSlice } from './slices/logSlice';
import type { ModelSlice } from './slices/modelSlice';

export type AppStore = AuthSlice & AgentSlice & ChatSlice & KanbanSlice & LogSlice & ModelSlice;

export const useStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createAuthSlice(...a),
      ...createAgentSlice(...a),
      ...createChatSlice(...a),
      ...createKanbanSlice(...a),
      ...createLogSlice(...a),
      ...createModelSlice(...a),
    }),
    {
      name: 'herness-store',
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    },
  ),
);

import { createAuthSlice } from './slices/authSlice';
import { createAgentSlice } from './slices/agentSlice';
import { createChatSlice } from './slices/chatSlice';
import { createKanbanSlice } from './slices/kanbanSlice';
import { createLogSlice } from './slices/logSlice';
import { createModelSlice } from './slices/modelSlice';
