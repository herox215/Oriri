import type { StorageInterface } from '../storage/storage-interface.js';
import type { LogService } from '../logs/log-service.js';
import type { RoleService } from '../agents/role-service.js';
import type { AgentRole } from '../config/config-types.js';
import type { TaskType } from './task-types.js';
import { StorageReadError, TaskNotFoundError, TaskAlreadyClaimedError } from '../shared/errors.js';
import type { CreateTaskInput, TaskStatus } from './task-types.js';
import { generateUniqueTaskId } from './task-id.js';
import {
  buildTaskMarkdown,
  extractAssignedToFromMarkdown,
  extractStatusFromMarkdown,
  extractTypeFromMarkdown,
  replaceAssignedToInMarkdown,
  replaceDependenciesInMarkdown,
  replaceStatusInMarkdown,
} from './task-markdown.js';

export class TaskService {
  constructor(
    private readonly storage: StorageInterface,
    private readonly logService: LogService,
    private readonly roleService: RoleService,
  ) {}

  async createTask(input: CreateTaskInput): Promise<string> {
    const existingIds = await this.storage.listTasks();
    const id = generateUniqueTaskId(input.createdBy, input.title, existingIds);
    const createdAt = new Date().toISOString();

    const markdown = buildTaskMarkdown({
      id,
      title: input.title,
      type: input.type,
      status: 'open',
      createdBy: input.createdBy,
      createdAt,
      contextBundle: input.contextBundle,
      dependencies: input.dependencies,
    });

    await this.storage.writeTask(id, markdown);
    await this.logService.appendLog(id, input.createdBy, `created task: ${input.title}`);

    return id;
  }

  async readTask(id: string): Promise<string> {
    try {
      return await this.storage.readTask(id);
    } catch (error: unknown) {
      if (error instanceof StorageReadError) {
        throw new TaskNotFoundError(id);
      }
      throw error;
    }
  }

  async listTasks(): Promise<string[]> {
    return this.storage.listTasks();
  }

  async deleteTask(id: string): Promise<void> {
    await this.storage.deleteTask(id);
  }

  async claimTask(id: string, agentId: string, role: AgentRole): Promise<void> {
    const markdown = await this.readTask(id);

    const taskType = extractTypeFromMarkdown(markdown) as TaskType | null;
    const currentStatus = extractStatusFromMarkdown(markdown) as TaskStatus | null;

    if (!taskType || !currentStatus) {
      throw new TaskNotFoundError(id);
    }

    const assignedTo = extractAssignedToFromMarkdown(markdown);
    if (assignedTo !== null && assignedTo !== '—') {
      throw new TaskAlreadyClaimedError(id, assignedTo);
    }

    this.roleService.checkCanClaimTask(role, taskType, currentStatus);

    let updated = replaceStatusInMarkdown(markdown, 'planning');
    updated = replaceAssignedToInMarkdown(updated, agentId);

    await this.storage.writeTask(id, updated);
    await this.logService.appendLog(
      id,
      agentId,
      `claimed task, status: ${currentStatus} → planning`,
    );
  }

  async setDependencies(id: string, dependencies: string[], agentId: string): Promise<void> {
    const markdown = await this.readTask(id);
    const updated = replaceDependenciesInMarkdown(markdown, dependencies);
    await this.storage.writeTask(id, updated);
    await this.logService.appendLog(
      id,
      agentId,
      `dependencies set: ${dependencies.length > 0 ? dependencies.join(', ') : 'none'}`,
    );
  }

  async updateStatus(id: string, newStatus: TaskStatus, agentId: string): Promise<void> {
    const markdown = await this.readTask(id);
    const currentStatus = extractStatusFromMarkdown(markdown);
    const updated = replaceStatusInMarkdown(markdown, newStatus);

    await this.storage.writeTask(id, updated);
    await this.logService.appendLog(
      id,
      agentId,
      `status: ${currentStatus ?? 'unknown'} → ${newStatus}`,
    );
  }
}
