export const AGENT_ROLES = ['AGENT', 'MCP_CLIENT'] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const LLM_PROVIDERS = ['anthropic', 'mistral'] as const;

export type LLMProviderType = (typeof LLM_PROVIDERS)[number];

export const STORAGE_MODES = ['local', 'server', 'hybrid'] as const;

export type StorageMode = (typeof STORAGE_MODES)[number];

export interface ProviderConfig {
  name: string;
  model: string;
  key: string;
}

export interface RuntimeAgentConfig {
  id: string;
  display_name: string;
  model: string;
  role: AgentRole;
  provider: LLMProviderType;
  api_key: string;
}

export interface BackupConfig {
  auto_snapshot?: boolean; // server mode only: commit .oriri/ as a git snapshot after each backup
}

export interface OririConfig {
  mode: StorageMode;
  provider?: ProviderConfig[];
  backup?: BackupConfig;
}
