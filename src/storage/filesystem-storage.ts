import { readFile, writeFile, appendFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { OririError, StorageReadError } from '../shared/errors.js';
import type { StorageInterface } from './storage-interface.js';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export class FilesystemStorage implements StorageInterface {
  constructor(private readonly basePath: string) {}

  private taskPath(id: string): string {
    return join(this.basePath, 'human-tasks', `task-${id}.md`);
  }

  private logPath(taskId: string): string {
    return join(this.basePath, 'human-tasks', `task-${taskId}.log.md`);
  }

  private a2aPath(id: string): string {
    return join(this.basePath, 'agent-tasks', `a2a-${id}.md`);
  }

  private a2aLogPath(id: string): string {
    return join(this.basePath, 'agent-tasks', `a2a-${id}.log.md`);
  }

  private storyPath(): string {
    return join(this.basePath, 'story.md');
  }

  private activeAgentsPath(): string {
    return join(this.basePath, 'agents', 'active.md');
  }

  private async readFileOrThrow(filePath: string, entity: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new StorageReadError(entity);
      }
      throw error;
    }
  }

  // Tasks

  async readTask(id: string): Promise<string> {
    return this.readFileOrThrow(this.taskPath(id), `Task ${id}`);
  }

  async writeTask(id: string, content: string): Promise<void> {
    await writeFile(this.taskPath(id), content, 'utf-8');
  }

  async listTasks(): Promise<string[]> {
    try {
      const files = await readdir(join(this.basePath, 'human-tasks'));
      const taskPattern = /^task-(.+)\.md$/;
      return files
        .filter((f) => taskPattern.test(f) && !f.includes('.log.'))
        .map((f) => {
          const match = taskPattern.exec(f);
          return match?.[1];
        })
        .filter((id): id is string => id !== undefined);
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      await unlink(this.taskPath(id));
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  // Logs

  async appendLog(taskId: string, line: string): Promise<void> {
    await appendFile(this.logPath(taskId), line + '\n', 'utf-8');
  }

  async readLog(taskId: string): Promise<string> {
    try {
      return await readFile(this.logPath(taskId), 'utf-8');
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }

  // Story

  async readStory(): Promise<string> {
    return this.readFileOrThrow(this.storyPath(), 'story.md');
  }

  async appendStory(line: string): Promise<void> {
    await appendFile(this.storyPath(), line + '\n', 'utf-8');
  }

  async writeStory(content: string): Promise<void> {
    await writeFile(this.storyPath(), content, 'utf-8');
  }

  // Story Archive

  private storyArchivePath(): string {
    return join(this.basePath, 'story.archive.md');
  }

  async readStoryArchive(): Promise<string> {
    return this.readFileOrThrow(this.storyArchivePath(), 'story.archive.md');
  }

  async appendStoryArchive(content: string): Promise<void> {
    await appendFile(this.storyArchivePath(), content, 'utf-8');
  }

  // A2A

  async readA2A(id: string): Promise<string> {
    return this.readFileOrThrow(this.a2aPath(id), `A2A ${id}`);
  }

  async writeA2A(id: string, content: string): Promise<void> {
    await writeFile(this.a2aPath(id), content, 'utf-8');
  }

  async appendA2ALog(id: string, line: string): Promise<void> {
    await appendFile(this.a2aLogPath(id), line + '\n', 'utf-8');
  }

  async readA2ALog(id: string): Promise<string> {
    try {
      return await readFile(this.a2aLogPath(id), 'utf-8');
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') return '';
      throw error;
    }
  }

  async listA2A(): Promise<string[]> {
    const files = await readdir(join(this.basePath, 'agent-tasks'));
    const a2aPattern = /^a2a-(.+)\.md$/;
    return files
      .map((f) => {
        const match = a2aPattern.exec(f);
        return match?.[1];
      })
      .filter((id): id is string => id !== undefined);
  }

  // Agents

  async readActiveAgents(): Promise<string> {
    return this.readFileOrThrow(this.activeAgentsPath(), 'agents/active.md');
  }

  async writeActiveAgents(content: string): Promise<void> {
    await writeFile(this.activeAgentsPath(), content, 'utf-8');
  }
}

export function createStorageAdapter(mode: string, basePath: string): StorageInterface {
  if (mode === 'local') {
    return new FilesystemStorage(basePath);
  }
  throw new OririError(`Unknown storage mode: ${mode}`, 'UNKNOWN_STORAGE_MODE');
}
