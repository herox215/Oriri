export const AGENT_ROLES = [
  'GENERALIST',
  'CODER',
  'REVIEWER',
  'COORDINATOR',
  'ARCHITECT',
  'OBSERVER',
  'MCP_CLIENT',
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const LLM_PROVIDERS = ['anthropic', 'mistral'] as const;

export type LLMProviderType = (typeof LLM_PROVIDERS)[number];

export const STORAGE_MODES = ['local', 'server', 'hybrid'] as const;

export type StorageMode = (typeof STORAGE_MODES)[number];

export interface AgentConfig {
  id: string;
  display_name: string;
  model: string;
  role: AgentRole;
  provider?: LLMProviderType;
  api_key?: string;
  system_prompt?: string;
  capabilities?: string[];
}

export interface BackupConfig {
  auto_snapshot?: boolean; // server mode only: commit .oriri/ as a git snapshot after each backup
}

export interface OririConfig {
  mode: StorageMode;
  agents?: AgentConfig[];
  backup?: BackupConfig;
}
