import type { StorageInterface } from '../storage/storage-interface.js';
import type { ActiveAgent } from './agent-types.js';
import { AgentNotFoundError, AgentAlreadyRegisteredError } from '../shared/errors.js';
import {
  parseActiveAgentsMarkdown,
  buildActiveAgentsMarkdown,
  addAgentRow,
  removeAgentRow,
} from './active-agents-markdown.js';

export class AgentRegistry {
  constructor(private readonly storage: StorageInterface) {}

  async register(agent: ActiveAgent): Promise<void> {
    const content = await this.storage.readActiveAgents();
    const agents = parseActiveAgentsMarkdown(content);

    if (agents.some((a) => a.id === agent.id)) {
      throw new AgentAlreadyRegisteredError(agent.id);
    }

    const updated = addAgentRow(content, agent);
    await this.storage.writeActiveAgents(updated);
  }

  async deregister(agentId: string): Promise<void> {
    const content = await this.storage.readActiveAgents();
    const agents = parseActiveAgentsMarkdown(content);

    if (!agents.some((a) => a.id === agentId)) {
      throw new AgentNotFoundError(agentId);
    }

    const updated = removeAgentRow(content, agentId);
    await this.storage.writeActiveAgents(updated);
  }

  async isRegistered(agentId: string): Promise<boolean> {
    const content = await this.storage.readActiveAgents();
    const agents = parseActiveAgentsMarkdown(content);
    return agents.some((a) => a.id === agentId);
  }

  async listAgents(): Promise<ActiveAgent[]> {
    const content = await this.storage.readActiveAgents();
    return parseActiveAgentsMarkdown(content);
  }

  async updateLastSeen(agentId: string): Promise<void> {
    const content = await this.storage.readActiveAgents();
    const agents = parseActiveAgentsMarkdown(content);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return; // Best-effort — agent may have been deregistered concurrently
    agent.lastSeen = new Date().toISOString();
    const updated = buildActiveAgentsMarkdown(agents);
    await this.storage.writeActiveAgents(updated);
  }

  async clearAll(): Promise<void> {
    const content = buildActiveAgentsMarkdown([]);
    await this.storage.writeActiveAgents(content);
  }
}
