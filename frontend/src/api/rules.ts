import client from './client';
import type { RuleChain, RuleChainDsl } from '../types/rule';

export async function listRules(): Promise<{ rules: RuleChain[] }> {
  const res = await client.get('/rules');
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
