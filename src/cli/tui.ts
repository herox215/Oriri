import { join } from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { TaskService } from '../tasks/task-service.js';
import { render } from 'ink';
import { createElement } from 'react';
import { App } from './tui/app.js';

export async function tuiCommand(options?: { cwd?: string }): Promise<void> {
  const basePath = join(options?.cwd ?? process.cwd(), '.oriri');
  await loadConfig(basePath);
  const storage = new FilesystemStorage(basePath);
  const taskService = new TaskService(storage);

  const { waitUntilExit } = render(createElement(App, { taskService }));
  await waitUntilExit();
}
