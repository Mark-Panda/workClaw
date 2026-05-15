import client from './client';
import type { LogEntry, LogFilter } from '../types/log';

export async function listLogs(
  filter?: LogFilter,
): Promise<{ logs: LogEntry[]; total: number; page: number }> {
  const res = await client.get('/logs', { params: filter });
  return res.data;
}

export async function getLogEntry(id: string): Promise<LogEntry> {
  const res = await client.get(`/logs/${id}`);
  return res.data;
}
