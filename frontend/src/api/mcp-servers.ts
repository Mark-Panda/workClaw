import client from './client';

export interface McpServerItem {
  id: string;
  name: string;
  transport: string;
  command?: string;
  args_json?: string;
  url?: string;
  env_json?: string;
  enabled: boolean;
}

export interface CreateMcpServerRequest {
  name: string;
  transport: string;
  command?: string;
  args_json?: string;
  url?: string;
  env_json?: string;
  enabled?: boolean;
}

export interface UpdateMcpServerRequest {
  name?: string;
  transport?: string;
  command?: string;
  args_json?: string;
  url?: string;
  env_json?: string;
  enabled?: boolean;
}

export async function listMcpServers(): Promise<{ mcp_servers: McpServerItem[] }> {
  const res = await client.get('/mcp-servers');
  return res.data;
}

export async function getMcpServer(id: string): Promise<McpServerItem> {
  const res = await client.get(`/mcp-servers/${id}`);
  return res.data;
}

export async function createMcpServer(data: CreateMcpServerRequest): Promise<{ id: string }> {
  const res = await client.post('/mcp-servers', data);
  return res.data;
}

export async function updateMcpServer(id: string, data: UpdateMcpServerRequest): Promise<void> {
  await client.put(`/mcp-servers/${id}`, data);
}

export async function deleteMcpServer(id: string): Promise<void> {
  await client.delete(`/mcp-servers/${id}`);
}
