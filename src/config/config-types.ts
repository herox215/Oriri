export const AGENT_ROLES = [
  'GENERALIST',
  'CODER',
  'REVIEWER',
  'COORDINATOR',
  'ARCHITECT',
  'OBSERVER',
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const STORAGE_MODES = ['local', 'server', 'hybrid'] as const;

export type StorageMode = (typeof STORAGE_MODES)[number];

export interface AgentConfig {
  id: string;
  display_name: string;
  model: string;
  role: AgentRole;
  api_key?: string;
  capabilities?: string[];
}

export interface OririConfig {
  mode: StorageMode;
  agents?: AgentConfig[];
}
