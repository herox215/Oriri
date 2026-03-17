import { join } from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { TaskService } from '../tasks/task-service.js';
import { render } from 'ink';
import { createElement } from 'react';
import { App } from './tui/app.js';

export async function tuiCommand(options?: { cwd?: string }): Promise<void> {
  const projectRoot = options?.cwd ?? process.cwd();
  const basePath = join(projectRoot, '.oriri');
  const config = await loadConfig(basePath);
  const storage = new FilesystemStorage(basePath);
  const registry = new AgentRegistry(storage);
  const logService = new LogService(storage);
  const roleService = new RoleService();
  const taskService = new TaskService(storage, logService, roleService);

  const { waitUntilExit } = render(
    createElement(App, { registry, taskService, logService, config, projectRoot }),
  );
  await waitUntilExit();
}
