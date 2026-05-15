export interface LlmProvider {
  id: string;
  name: string;
  provider_type: string;
  base_url: string | null;
  api_key: string;
  is_default: boolean;
  model_count?: number;
  models?: LlmModel[];
}

export interface LlmModel {
  id: string;
  model_name: string;
  display_name: string | null;
  max_tokens: number;
  temperature: number;
  is_default: boolean;
}

export interface CreateProviderRequest {
  name: string;
  provider_type?: string;
  base_url?: string;
  api_key?: string;
  is_default?: boolean;
}

export interface UpdateProviderRequest {
  name?: string;
  provider_type?: string;
  base_url?: string;
  api_key?: string;
  is_default?: boolean;
}

export interface AddModelRequest {
  model_name: string;
  display_name?: string;
  max_tokens?: number;
  temperature?: number;
  is_default?: boolean;
}

export interface UpdateModelRequest {
  model_name?: string;
  display_name?: string;
  max_tokens?: number;
  temperature?: number;
  is_default?: boolean;
}
