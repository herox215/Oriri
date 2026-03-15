import type { AgentRegistry } from './agent-registry.js';

export interface ShutdownController {
  isShutdownRequested(): boolean;
  onShutdown(callback: () => void): void;
}

export function setupGracefulShutdown(
  agentId: string,
  registry: AgentRegistry,
): ShutdownController {
  let shuttingDown = false;
  const callbacks: (() => void)[] = [];

  const handler = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const cb of callbacks) {
      cb();
    }

    try {
      await registry.deregister(agentId);
    } catch {
      // Agent may already be removed from active.md — proceed with exit
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => void handler());
  process.on('SIGINT', () => void handler());

  return {
    isShutdownRequested(): boolean {
      return shuttingDown;
    },
    onShutdown(callback: () => void): void {
      callbacks.push(callback);
    },
  };
}
