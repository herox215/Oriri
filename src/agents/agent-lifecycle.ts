import type { AgentRegistry } from './agent-registry.js';

export function setupGracefulShutdown(agentId: string, registry: AgentRegistry): void {
  let shuttingDown = false;

  const handler = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      await registry.deregister(agentId);
    } catch {
      // Agent may already be removed from active.md — proceed with exit
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => void handler());
  process.on('SIGINT', () => void handler());
}
