import type { StorageInterface } from '../storage/storage-interface.js';
import type { CreateTaskInput } from './task-types.js';
import { StorageReadError, TaskNotFoundError } from '../shared/errors.js';
import { generateUniqueTaskId } from './task-id.js';
import { buildTaskMarkdown, replaceStatusInMarkdown } from './task-markdown.js';

export class TaskService {
  constructor(private readonly storage: StorageInterface) {}

  private async readTaskOrThrow(id: string): Promise<string> {
    try {
      return await this.storage.readTask(id);
    } catch (error: unknown) {
      if (error instanceof StorageReadError) {
        throw new TaskNotFoundError(id);
      }
      throw error;
    }
  }

  async createTask(input: CreateTaskInput): Promise<string> {
    const existingIds = await this.storage.listTasks();
    const id = generateUniqueTaskId(input.title, existingIds);
    const createdAt = new Date().toISOString();

    const markdown = buildTaskMarkdown({
      id,
      title: input.title,
      status: 'open',
      createdAt,
      description: input.description,
    });

    await this.storage.writeTask(id, markdown);
    return id;
  }

  async readTask(id: string): Promise<string> {
    return this.readTaskOrThrow(id);
  }

  async listTasks(): Promise<string[]> {
    return this.storage.listTasks();
  }

  async deleteTask(id: string): Promise<void> {
    await this.storage.deleteTask(id);
  }

  async completeTask(id: string): Promise<void> {
    const markdown = await this.readTaskOrThrow(id);
    const updated = replaceStatusInMarkdown(markdown, 'done');
    await this.storage.writeTask(id, updated);
  }
}
