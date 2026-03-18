import type { StorageInterface } from '../storage/storage-interface.js';
import type { CreateTaskInput, TaskDetails, SearchTasksFilter } from './task-types.js';
import { StorageReadError, TaskNotFoundError } from '../shared/errors.js';
import { generateUniqueTaskId } from './task-id.js';
import { buildTaskMarkdown, replaceStatusInMarkdown, parseTaskMarkdown } from './task-markdown.js';

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
      complexity: input.complexity,
    });

    await this.storage.writeTask(id, markdown);
    return id;
  }

  async readTask(id: string): Promise<string> {
    return this.readTaskOrThrow(id);
  }

  async getTaskDetails(id: string): Promise<TaskDetails> {
    const markdown = await this.readTaskOrThrow(id);
    return parseTaskMarkdown(id, markdown);
  }

  async listTasks(): Promise<string[]> {
    return this.storage.listTasks();
  }

  async searchTasks(filter: SearchTasksFilter): Promise<TaskDetails[]> {
    const ids = await this.storage.listTasks();
    const results: TaskDetails[] = [];

    for (const id of ids) {
      try {
        const details = await this.getTaskDetails(id);

        if (filter.status != null && details.status !== filter.status) continue;
        if (filter.complexity != null && details.complexity !== filter.complexity) continue;
        if (
          filter.query != null &&
          !details.title.toLowerCase().includes(filter.query.toLowerCase())
        )
          continue;

        results.push(details);
      } catch {
        // Skip unreadable tasks
      }
    }

    return results;
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
