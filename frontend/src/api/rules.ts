import client from './client';
import type { RuleChain, RuleChainDsl } from '../types/rule';

export interface ListRulesParams {
  page?: number;
  page_size?: number;
}

export interface ListRulesResponse {
  rules: RuleChain[];
  total: number;
  page: number;
  page_size: number;
}

export async function listRules(params?: ListRulesParams): Promise<ListRulesResponse> {
  const res = await client.get('/rules', { params });
  // Backward compat: if response is array-shaped, wrap it
  if (Array.isArray(res.data)) {
    return { rules: res.data, total: res.data.length, page: 1, page_size: res.data.length };
  }
  return res.data;
}

export async function getRule(id: string): Promise<RuleChain> {
  const res = await client.get(`/rules/${id}`);
  return res.data;
}

export async function createRule(data: Partial<RuleChain>): Promise<{ id: string }> {
  const res = await client.post('/rules', data);
  return res.data;
}

export async function updateRule(id: string, data: Partial<RuleChain>): Promise<RuleChain> {
  const res = await client.put(`/rules/${id}`, data);
  return res.data;
}

export async function deleteRule(id: string): Promise<void> {
  await client.delete(`/rules/${id}`);
}

export async function executeRule(id: string, input: unknown): Promise<{ status: string; output: unknown }> {
  const res = await client.post(`/rules/${id}/execute`, { input });
  return res.data;
}

export async function validateRule(dsl: RuleChainDsl): Promise<{ valid: boolean; warnings: string[] }> {
  const res = await client.post('/rules/validate', { dsl });
  return res.data;
}

export async function toggleRule(id: string, enabled: boolean): Promise<{ id: string; status: string }> {
  const res = await client.post(`/rules/${id}/toggle`, { enabled });
  return res.data;
}
