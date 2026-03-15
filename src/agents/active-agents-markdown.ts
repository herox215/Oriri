import type { AgentRole } from '../config/config-types.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import type { ActiveAgent } from './agent-types.js';

export function parseActiveAgentsMarkdown(content: string): ActiveAgent[] {
  const agents: ActiveAgent[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    // Skip header and separator rows
    if (/\|\s*ID\s*\|/i.test(line)) continue;
    if (/\|-+\|/.test(line)) continue;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    const id = cells[0] ?? '';
    const role = cells[1] ?? '';
    const model = cells[2] ?? '';
    const pidStr = cells[3] ?? '';
    const since = cells[4] ?? '';

    if (id === '' || role === '') continue;

    agents.push({
      id,
      role: role as AgentRole,
      model,
      pid: parseInt(pidStr, 10),
      since,
    });
  }

  return agents;
}

export function buildActiveAgentsMarkdown(agents: ActiveAgent[]): string {
  let content = ACTIVE_AGENTS_MD;
  for (const agent of agents) {
    content += `| ${agent.id} | ${agent.role} | ${agent.model} | ${String(agent.pid)} | ${agent.since} |\n`;
  }
  return content;
}

export function addAgentRow(content: string, agent: ActiveAgent): string {
  const agents = parseActiveAgentsMarkdown(content);
  agents.push(agent);
  return buildActiveAgentsMarkdown(agents);
}

export function removeAgentRow(content: string, agentId: string): string {
  const agents = parseActiveAgentsMarkdown(content);
  const filtered = agents.filter((a) => a.id !== agentId);
  return buildActiveAgentsMarkdown(filtered);
}
