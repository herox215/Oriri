import type { StorageInterface } from '../storage/storage-interface.js';
import type { LogService } from '../logs/log-service.js';
import type { RoleService } from '../agents/role-service.js';
import type { AgentRole } from '../config/config-types.js';
import type { TaskType } from './task-types.js';
import { StorageReadError, TaskNotFoundError, TaskAlreadyClaimedError, TaskNotDraftError } from '../shared/errors.js';
import type { CreateTaskInput, TaskStatus } from './task-types.js';
import { generateUniqueTaskId } from './task-id.js';
import {
  buildTaskMarkdown,
  clearAssignedToInMarkdown,
  extractAssignedToFromMarkdown,
  extractContextBundleFromMarkdown,
  extractStatusFromMarkdown,
  extractTypeFromMarkdown,
  replaceAssignedToInMarkdown,
  replaceContextBundleInMarkdown,
  replaceDependenciesInMarkdown,
  replaceStatusInMarkdown,
  replaceTypeInMarkdown,
} from './task-markdown.js';

export class TaskService {
  constructor(
    private readonly storage: StorageInterface,
    private readonly logService: LogService,
    private readonly roleService: RoleService,
  ) {}

  private async readTaskWithNamespace(id: string): Promise<{ markdown: string; h2a: boolean }> {
    try {
      const markdown = await this.storage.readTask(id);
      return { markdown, h2a: false };
    } catch (error: unknown) {
      if (error instanceof StorageReadError) {
        try {
          const markdown = await this.storage.readHumanTask(id);
          return { markdown, h2a: true };
        } catch (innerError: unknown) {
          if (innerError instanceof StorageReadError) {
            throw new TaskNotFoundError(id);
          }
          throw innerError;
        }
      }
      throw error;
    }
  }

  private async writeTaskByType(id: string, markdown: string): Promise<void> {
    const type = extractTypeFromMarkdown(markdown);
    if (type === 'h2a') {
      await this.storage.writeHumanTask(id, markdown);
    } else {
      await this.storage.writeTask(id, markdown);
    }
  }

  async createTask(input: CreateTaskInput): Promise<string> {
    const [regularIds, humanIds] = await Promise.all([
      this.storage.listTasks(),
      this.storage.listHumanTasks(),
    ]);
    const existingIds = [...regularIds, ...humanIds];
    const id = generateUniqueTaskId(input.createdBy, input.title, existingIds);
    const createdAt = new Date().toISOString();
    const isH2A = input.type === 'h2a';

    const markdown = buildTaskMarkdown({
      id,
      title: input.title,
      type: input.type,
      status: input.status ?? 'open',
      createdBy: input.createdBy,
      createdAt,
      contextBundle: input.contextBundle,
      dependencies: input.dependencies,
    });

    if (isH2A) {
      await this.storage.writeHumanTask(id, markdown);
    } else {
      await this.storage.writeTask(id, markdown);
    }
    await this.logService.appendLog(id, input.createdBy, `created task: ${input.title}`, isH2A);

    return id;
  }

  async readTask(id: string): Promise<string> {
    const { markdown } = await this.readTaskWithNamespace(id);
    return markdown;
  }

  async listTasks(): Promise<string[]> {
    const [regular, human] = await Promise.all([
      this.storage.listTasks(),
      this.storage.listHumanTasks(),
    ]);
    return [...regular, ...human];
  }

  async deleteTask(id: string): Promise<void> {
    try {
      await this.storage.readTask(id);
      await this.storage.deleteTask(id);
      return;
    } catch (error: unknown) {
      if (error instanceof StorageReadError) {
        await this.storage.deleteHumanTask(id);
        return;
      }
      throw error;
    }
  }

  async getTaskLog(id: string): Promise<string> {
    const { h2a } = await this.readTaskWithNamespace(id);
    return this.logService.getLog(id, h2a);
  }

  async appendTaskLog(id: string, agentId: string, message: string): Promise<void> {
    const { h2a } = await this.readTaskWithNamespace(id);
    await this.logService.appendLog(id, agentId, message, h2a);
  }

  async updateTaskContent(id: string, content: string): Promise<void> {
    // Resolve namespace from existing task, then write new content to same namespace
    const { h2a } = await this.readTaskWithNamespace(id);
    if (h2a) {
      await this.storage.writeHumanTask(id, content);
    } else {
      await this.storage.writeTask(id, content);
    }
  }

  async claimTask(id: string, agentId: string, role: AgentRole): Promise<void> {
    const { markdown, h2a } = await this.readTaskWithNamespace(id);

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

    await this.writeTaskByType(id, updated);
    await this.logService.appendLog(
      id,
      agentId,
      `claimed task, status: ${currentStatus} → planning`,
      h2a,
    );
  }

  async setDependencies(id: string, dependencies: string[], agentId: string): Promise<void> {
    const { markdown, h2a } = await this.readTaskWithNamespace(id);
    const updated = replaceDependenciesInMarkdown(markdown, dependencies);
    await this.writeTaskByType(id, updated);
    await this.logService.appendLog(
      id,
      agentId,
      `dependencies set: ${dependencies.length > 0 ? dependencies.join(', ') : 'none'}`,
      h2a,
    );
  }

  async refineTask(
    id: string,
    agentId: string,
    options?: { type?: TaskType | undefined; contextBundle?: string | undefined },
  ): Promise<{ targetStatus: TaskStatus }> {
    const { markdown, h2a } = await this.readTaskWithNamespace(id);
    const currentStatus = extractStatusFromMarkdown(markdown);

    if (currentStatus !== 'draft') {
      throw new TaskNotDraftError(id, currentStatus ?? 'unknown');
    }

    const effectiveType = options?.type ?? extractTypeFromMarkdown(markdown);
    const targetStatus: TaskStatus = effectiveType === 'escalation' ? 'needs_human' : 'open';

    let updated = markdown;
    if (options?.type) {
      updated = replaceTypeInMarkdown(updated, options.type);
    }
    if (options?.contextBundle) {
      updated = replaceContextBundleInMarkdown(updated, options.contextBundle);
    }
    updated = replaceStatusInMarkdown(updated, targetStatus);

    await this.writeTaskByType(id, updated);
    await this.logService.appendLog(id, agentId, `refined task: draft → ${targetStatus}`, h2a);

    return { targetStatus };
  }

  async handleHumanInput(id: string, text: string): Promise<void> {
    const { markdown, h2a } = await this.readTaskWithNamespace(id);
    const existingContext = extractContextBundleFromMarkdown(markdown);
    const appendedContext = existingContext
      ? `${existingContext}\n\n### Human Input\n\n${text}`
      : `### Human Input\n\n${text}`;

    let updated = replaceContextBundleInMarkdown(markdown, appendedContext);
    updated = replaceStatusInMarkdown(updated, 'open');
    updated = clearAssignedToInMarkdown(updated);

    await this.writeTaskByType(id, updated);
    await this.logService.appendLog(id, 'human', `human input: ${text}`, h2a);
  }

  async updateStatus(id: string, newStatus: TaskStatus, agentId: string): Promise<void> {
    const { markdown, h2a } = await this.readTaskWithNamespace(id);
    const currentStatus = extractStatusFromMarkdown(markdown);
    const updated = replaceStatusInMarkdown(markdown, newStatus);

    await this.writeTaskByType(id, updated);
    await this.logService.appendLog(
      id,
      agentId,
      `status: ${currentStatus ?? 'unknown'} → ${newStatus}`,
      h2a,
    );
  }
}
