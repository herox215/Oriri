import type { AgentRole } from '../config/config-types.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import type { RoleService } from '../agents/role-service.js';

export class StoryService {
  constructor(
    private readonly storage: StorageInterface,
    private readonly roleService: RoleService,
  ) {}

  async appendStory(agentId: string, role: AgentRole, message: string): Promise<void> {
    this.roleService.checkCanWriteStory(role);
    const line = this.formatEntry(agentId, message);
    await this.storage.appendStory(line);
  }

  async appendDecision(
    agentId: string,
    role: AgentRole,
    a2aId: string,
    message: string,
  ): Promise<void> {
    if (!a2aId) {
      throw new Error('a2aId is required for decision entries');
    }
    this.roleService.checkCanWriteStory(role);
    const line = this.formatEntry(agentId, `${message} (via a2a-${a2aId})`);
    await this.storage.appendStory(line);
  }

  async appendCorrection(agentId: string, role: AgentRole, message: string): Promise<void> {
    this.roleService.checkCanWriteStory(role);
    const line = this.formatEntry(agentId, `[CORRECTION] ${message}`);
    await this.storage.appendStory(line);
  }

  async getStory(): Promise<string> {
    return this.storage.readStory();
  }

  private formatEntry(agentId: string, message: string): string {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return `[${timestamp}] ${agentId} | ${message}`;
  }
}
