import type { RuleChain } from '../../types/rule';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface RuleSlice {
  rules: RuleChain[];
  currentRule: RuleChain | null;
  rulesLoading: boolean;
  setRules: (rules: RuleChain[]) => void;
  setCurrentRule: (rule: RuleChain | null) => void;
  setRulesLoading: (loading: boolean) => void;
}

export const createRuleSlice: StateCreator<AppStore, [], [], RuleSlice> = (set) => ({
  rules: [],
  currentRule: null,
  rulesLoading: false,

  setRules: (rules) => set({ rules }),
  setCurrentRule: (currentRule) => set({ currentRule }),
  setRulesLoading: (loading) => set({ rulesLoading: loading }),
});
