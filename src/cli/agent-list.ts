import type { AgentRegistry } from '../agents/agent-registry.js';

export async function agentListCommand(registry: AgentRegistry): Promise<void> {
  const agents = await registry.listAgents();

  if (agents.length === 0) {
    console.log('No active agents.');
    return;
  }

  console.log('ID               Role          Model                PID     Since');
  console.log('───────────────  ────────────  ───────────────────  ──────  ──────────');
  for (const agent of agents) {
    console.log(
      `${agent.id.padEnd(15)}  ${agent.role.padEnd(12)}  ${agent.model.padEnd(19)}  ${String(agent.pid).padEnd(6)}  ${agent.since}`,
    );
  }
}
