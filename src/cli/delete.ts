import { join } from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { TaskService } from '../tasks/task-service.js';
import { buildH2AContextBundle } from '../tasks/h2a-actions.js';

export async function deleteCommand(targetId: string, options?: { cwd?: string }): Promise<void> {
  const basePath = join(options?.cwd ?? process.cwd(), '.oriri');
  await loadConfig(basePath);

  const storage = new FilesystemStorage(basePath);
  const logService = new LogService(storage);
  const roleService = new RoleService();
  const taskService = new TaskService(storage, logService, roleService);

  // Verify target task exists
  await taskService.readTask(targetId);

  const contextBundle = buildH2AContextBundle({
    action: 'delete_task',
    targetId,
  });

  const id = await taskService.createTask({
    title: `Delete ${targetId}`,
    type: 'h2a',
    createdBy: 'cli',
    contextBundle,
    status: 'open',
  });

  console.log(`H2A task created: ${id}`);
}
