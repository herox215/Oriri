import type { AgentRole } from '../config/config-types.js';

export interface ActiveAgent {
  id: string;
  role: AgentRole;
  model: string;
  pid: number;
  since: string;
}
