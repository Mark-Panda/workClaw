export interface AgentConfig {
  provider_id?: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface AgentSkill {
  id: string;
  skillName: string;
  skillPath?: string;
  configJson?: string;
  enabled: boolean;
}

export interface AgentMcpServer {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  argsJson?: string;
  url?: string;
  envJson?: string;
  enabled: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  config: AgentConfig;
  status: 'running' | 'stopped' | 'error';
  skills: AgentSkill[];
  mcpServers: AgentMcpServer[];
  createdAt: string;
  updatedAt: string;
}
