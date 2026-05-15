import client from './client';
import type { Agent } from '../types/agent';

export async function listAgents(): Promise<{ agents: Agent[] }> {
  const res = await client.get('/agents');
  return res.data;
}

export async function getAgent(id: string): Promise<Agent> {
  const res = await client.get(`/agents/${id}`);
  return res.data;
}

export async function createAgent(data: Partial<Agent>): Promise<{ id: string }> {
  const res = await client.post('/agents', data);
  return res.data;
}

export async function updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
  const res = await client.put(`/agents/${id}`, data);
  return res.data;
}

export async function deleteAgent(id: string): Promise<void> {
  await client.delete(`/agents/${id}`);
}
