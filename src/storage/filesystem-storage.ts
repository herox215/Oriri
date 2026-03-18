import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { OririError, StorageReadError } from '../shared/errors.js';
import type { StorageInterface } from './storage-interface.js';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export class FilesystemStorage implements StorageInterface {
  constructor(private readonly basePath: string) {}

  private taskPath(id: string): string {
    return join(this.basePath, 'tasks', `task-${id}.md`);
  }

  async readTask(id: string): Promise<string> {
    try {
      return await readFile(this.taskPath(id), 'utf-8');
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new StorageReadError(`Task ${id}`);
      }
      throw error;
    }
  }

  async writeTask(id: string, content: string): Promise<void> {
    await writeFile(this.taskPath(id), content, 'utf-8');
  }

  async listTasks(): Promise<string[]> {
    try {
      const files = await readdir(join(this.basePath, 'tasks'));
      const taskPattern = /^task-(.+)\.md$/;
      return files
        .filter((f) => taskPattern.test(f))
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
}

export function createStorageAdapter(mode: string, basePath: string): StorageInterface {
  if (mode === 'local') {
    return new FilesystemStorage(basePath);
  }
  throw new OririError(`Unknown storage mode: ${mode}`, 'UNKNOWN_STORAGE_MODE');
}
