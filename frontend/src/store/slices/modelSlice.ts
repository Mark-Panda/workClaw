import type { LlmProvider } from '../../types/models';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface ModelSlice {
  providers: LlmProvider[];
  currentProvider: LlmProvider | null;
  modelsLoading: boolean;
  setProviders: (providers: LlmProvider[]) => void;
  setCurrentProvider: (provider: LlmProvider | null) => void;
  setModelsLoading: (loading: boolean) => void;
}

export const createModelSlice: StateCreator<AppStore, [], [], ModelSlice> = (set) => ({
  providers: [],
  currentProvider: null,
  modelsLoading: false,

  setProviders: (providers) => set({ providers }),
  setCurrentProvider: (currentProvider) => set({ currentProvider }),
  setModelsLoading: (loading) => set({ modelsLoading: loading }),
});
