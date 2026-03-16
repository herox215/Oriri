import type { AgentRegistry } from './agent-registry.js';

export interface StaleAgentInfo {
  agentId: string;
  lastSeen: string | undefined;
  pid: number;
}

export interface StaleAgentDetectorDeps {
  registry: AgentRegistry;
}

export class StaleAgentDetector {
  constructor(private readonly deps: StaleAgentDetectorDeps) {}

  async findStaleAgents(thresholdMs: number, selfId: string): Promise<StaleAgentInfo[]> {
    const agents = await this.deps.registry.listAgents();
    const now = Date.now();
    const stale: StaleAgentInfo[] = [];

    for (const agent of agents) {
      if (agent.id === selfId) continue;

      // PID > 0: check if process is still alive
      if (agent.pid > 0 && this.isProcessAlive(agent.pid)) continue;

      // Check lastSeen threshold
      if (agent.lastSeen) {
        const lastSeenTime = new Date(agent.lastSeen).getTime();
        if (!isNaN(lastSeenTime) && now - lastSeenTime <= thresholdMs) continue;
      }

      // No lastSeen and PID=0 → definitely stale (ghost MCP client)
      // lastSeen exceeded threshold → stale
      // PID>0 but process dead → stale
      stale.push({ agentId: agent.id, lastSeen: agent.lastSeen, pid: agent.pid });
    }

    return stale;
  }

  async cleanupStaleAgents(thresholdMs: number, selfId: string): Promise<string[]> {
    const stale = await this.findStaleAgents(thresholdMs, selfId);
    const cleaned: string[] = [];

    for (const info of stale) {
      try {
        await this.deps.registry.deregister(info.agentId);
        cleaned.push(info.agentId);
      } catch {
        // Agent may have been deregistered concurrently
      }
    }

    return cleaned;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
