import client from './client';
import type {
  LlmProvider,
  CreateProviderRequest,
  UpdateProviderRequest,
  AddModelRequest,
  UpdateModelRequest,
} from '../types/models';

export async function listProviders(): Promise<{ providers: LlmProvider[] }> {
  const res = await client.get('/models/providers');
  return res.data;
}

export async function getProvider(id: string): Promise<LlmProvider> {
  const res = await client.get(`/models/providers/${id}`);
  return res.data;
}

export async function createProvider(data: CreateProviderRequest): Promise<{ id: string }> {
  const res = await client.post('/models/providers', data);
  return res.data;
}

export async function updateProvider(id: string, data: UpdateProviderRequest): Promise<void> {
  await client.put(`/models/providers/${id}`, data);
}

export async function deleteProvider(id: string): Promise<void> {
  await client.delete(`/models/providers/${id}`);
}

export async function addModel(providerId: string, data: AddModelRequest): Promise<{ id: string }> {
  const res = await client.post(`/models/providers/${providerId}/models`, data);
  return res.data;
}

export async function updateModel(id: string, data: UpdateModelRequest): Promise<void> {
  await client.put(`/models/models/${id}`, data);
}

export async function deleteModel(id: string): Promise<void> {
  await client.delete(`/models/models/${id}`);
}
