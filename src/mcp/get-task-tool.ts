import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createGetTaskTool(
  taskService: TaskService,
  logService: LogService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'get_task',
    description: 'Read a task file and its activity log.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID (e.g. T-001)' },
      },
      required: ['id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.id === 'string' ? args.id : '';
    const [task, log] = await Promise.all([taskService.readTask(id), logService.getLog(id)]);
    const text = `## Task\n\n${task}\n\n## Log\n\n${log}`;
    return { content: [{ type: 'text', text }] };
  };

  return { definition, handler };
}
