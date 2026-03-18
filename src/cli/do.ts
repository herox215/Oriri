import { join } from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { TaskService } from '../tasks/task-service.js';

export async function doCommand(request: string, options?: { cwd?: string }): Promise<void> {
  const basePath = join(options?.cwd ?? process.cwd(), '.oriri');
  await loadConfig(basePath);

  const storage = new FilesystemStorage(basePath);
  const logService = new LogService(storage);
  const roleService = new RoleService();
  const taskService = new TaskService(storage, logService, roleService);

  const contextBundle = `### User Request\n\n${request}`;

  const id = await taskService.createTask({
    title: request,
    type: 'chore',
    createdBy: 'cli',
    status: 'open',
    contextBundle,
  });

  console.log(`Task created: ${id} (status: open)`);
}
