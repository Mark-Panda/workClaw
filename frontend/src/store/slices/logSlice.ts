import type { LogEntry, LogFilter } from '../../types/log';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface LogSlice {
  logs: LogEntry[];
  logFilter: LogFilter;
  logsTotal: number;
  logsLoading: boolean;
  setLogs: (logs: LogEntry[], total: number) => void;
  setLogFilter: (filter: LogFilter) => void;
  appendLog: (log: LogEntry) => void;
  setLogsLoading: (loading: boolean) => void;
}

export const createLogSlice: StateCreator<AppStore, [], [], LogSlice> = (set) => ({
  logs: [],
  logFilter: { page: 1, pageSize: 50 },
  logsTotal: 0,
  logsLoading: false,

  setLogs: (logs, total) => set({ logs, logsTotal: total }),
  setLogFilter: (filter) => set({ logFilter: filter }),

  appendLog: (log) =>
    set((state) => {
      const newLogs = [log, ...state.logs];
      if (newLogs.length > 500) newLogs.length = 500; // Cap at 500
      return { logs: newLogs };
    }),

  setLogsLoading: (loading) => set({ logsLoading: loading }),
});
