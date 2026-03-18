import {
  McpServer,
  createCreateTaskTool,
  createDeleteTaskTool,
  createExecuteTaskTool,
} from '../mcp/index.js';
import type { TaskService } from '../tasks/task-service.js';

export async function mcpServeCommand(taskService: TaskService): Promise<void> {
  const server = new McpServer();

  const tools = [
    createCreateTaskTool(taskService),
    createDeleteTaskTool(taskService),
    createExecuteTaskTool(taskService),
  ];

  for (const { definition, handler } of tools) {
    server.registerTool(definition, handler);
  }

  await server.serveStdio();
}
