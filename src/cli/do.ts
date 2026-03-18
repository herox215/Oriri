import { join } from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { TaskService } from '../tasks/task-service.js';

export async function doCommand(request: string, options?: { cwd?: string }): Promise<void> {
  const basePath = join(options?.cwd ?? process.cwd(), '.oriri');
  await loadConfig(basePath);

  const storage = new FilesystemStorage(basePath);
  const taskService = new TaskService(storage);

  const id = await taskService.createTask({
    title: request,
  });

  console.log(`Task created: ${id}`);
}
