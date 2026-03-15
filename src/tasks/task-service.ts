import type { StorageInterface } from '../storage/storage-interface.js';
import type { LogService } from '../logs/log-service.js';
import { StorageReadError, TaskNotFoundError } from '../shared/errors.js';
import type { CreateTaskInput, TaskStatus } from './task-types.js';
import { generateUniqueTaskId } from './task-id.js';
import {
  buildTaskMarkdown,
  extractStatusFromMarkdown,
  replaceStatusInMarkdown,
} from './task-markdown.js';

export class TaskService {
  constructor(
    private readonly storage: StorageInterface,
    private readonly logService: LogService,
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
