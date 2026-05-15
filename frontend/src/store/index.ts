import { create } from 'zustand';
import type { AuthSlice } from './slices/authSlice';
import type { AgentSlice } from './slices/agentSlice';
import type { RuleSlice } from './slices/ruleSlice';
import type { ChatSlice } from './slices/chatSlice';
import type { KanbanSlice } from './slices/kanbanSlice';
import type { LogSlice } from './slices/logSlice';
import type { ModelSlice } from './slices/modelSlice';

export type AppStore = AuthSlice & AgentSlice & RuleSlice & ChatSlice & KanbanSlice & LogSlice & ModelSlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createAgentSlice(...a),
  ...createRuleSlice(...a),
  ...createChatSlice(...a),
  ...createKanbanSlice(...a),
  ...createLogSlice(...a),
  ...createModelSlice(...a),
}));

// Import and re-export store creators
import { createAuthSlice } from './slices/authSlice';
import { createAgentSlice } from './slices/agentSlice';
import { createRuleSlice } from './slices/ruleSlice';
import { createChatSlice } from './slices/chatSlice';
import { createKanbanSlice } from './slices/kanbanSlice';
import { createLogSlice } from './slices/logSlice';
import { createModelSlice } from './slices/modelSlice';
