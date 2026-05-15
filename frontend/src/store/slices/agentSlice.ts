import type { Agent } from '../../types/agent';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface AgentSlice {
  agents: Agent[];
  currentAgent: Agent | null;
  agentsLoading: boolean;
  setAgents: (agents: Agent[]) => void;
  setCurrentAgent: (agent: Agent | null) => void;
  setAgentsLoading: (loading: boolean) => void;
}

export const createAgentSlice: StateCreator<AppStore, [], [], AgentSlice> = (set) => ({
  agents: [],
  currentAgent: null,
  agentsLoading: false,

  setAgents: (agents) => set({ agents }),
  setCurrentAgent: (currentAgent) => set({ currentAgent }),
  setAgentsLoading: (loading) => set({ agentsLoading: loading }),
});
