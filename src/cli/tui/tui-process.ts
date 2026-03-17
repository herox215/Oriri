import { spawn } from 'node:child_process';
import type { AgentRegistry } from '../../agents/agent-registry.js';

export function spawnAgent(providerName: string, role: string, cwd: string): void {
  const scriptPath = process.argv[1];
  if (!scriptPath) return;

  const child = spawn(process.execPath, [scriptPath, 'start-agent', '--provider', providerName, '--role', role], {
    cwd,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

export async function stopAgent(registry: AgentRegistry, agentId: string): Promise<void> {
  await registry.deregister(agentId);
}
