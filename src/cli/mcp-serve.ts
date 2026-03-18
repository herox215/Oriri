import {
  McpServer,
  createCreateTaskTool,
  createDeleteTaskTool,
  createExecuteTaskTool,
  createReadTaskTool,
  createSearchTasksTool,
  createStartTaskTool,
  createFinishTaskTool,
} from '../mcp/index.js';
import type { TaskService } from '../tasks/task-service.js';
import type { WorktreeManager } from '../git/worktree-manager.js';

export async function mcpServeCommand(
  taskService: TaskService,
  worktreeManager: WorktreeManager,
): Promise<void> {
  const server = new McpServer();

  const tools = [
    createCreateTaskTool(taskService),
    createDeleteTaskTool(taskService),
    createExecuteTaskTool(taskService),
    createReadTaskTool(taskService),
    createSearchTasksTool(taskService),
    createStartTaskTool(worktreeManager),
    createFinishTaskTool(worktreeManager),
  ];

  for (const { definition, handler } of tools) {
    server.registerTool(definition, handler);
  }

  await server.serveStdio();
}
