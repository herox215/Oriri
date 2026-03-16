import type { AgentRole } from '../config/config-types.js';

export type McpClientType = 'autonomous' | 'human_assisted';

export interface ActiveAgent {
  id: string;
  role: AgentRole;
  model: string;
  pid: number;
  since: string;
  lastSeen?: string;
  // MCP client fields (optional)
  displayName?: string;
  clientType?: McpClientType;
  clientSoftware?: string;
  pollInterval?: number;
}
