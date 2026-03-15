import type { AgentRegistry } from '../agents/agent-registry.js';

export async function agentStopCommand(
  registry: AgentRegistry,
  options: { agentId?: string | undefined; all?: boolean | undefined },
): Promise<void> {
  if (options.all) {
    await registry.clearAll();
    console.log('All agents removed from active.md.');
    return;
  }

  if (options.agentId) {
    await registry.deregister(options.agentId);
    console.log(`Agent ${options.agentId} removed from active.md.`);
    return;
  }

  console.error('Usage: oriri agent-stop --agent-id <id> | --all');
  process.exitCode = 1;
}
