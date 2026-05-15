export interface LogEntry {
  id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  createdAt: string;
}

export interface LogFilter {
  level?: string;
  source?: string;
  page?: number;
  pageSize?: number;
}
