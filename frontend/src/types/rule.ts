export interface RuleNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface RuleEdge {
  from: string;
  to: string;
  label?: string;
}

export interface InterceptorConfig {
  type: string;
  config?: Record<string, unknown>;
}

export interface RuleChainDsl {
  chain_id: string;
  version: string;
  nodes: RuleNode[];
  edges: RuleEdge[];
  interceptors: InterceptorConfig[];
}

export interface RuleChain {
  id: string;
  name: string;
  description?: string;
  dsl: RuleChainDsl;
  canvas_state?: unknown;
  version: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}
