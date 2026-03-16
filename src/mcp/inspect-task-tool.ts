import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createInspectTaskTool(
  taskService: TaskService,
  logService: LogService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'inspect_task',
    description:
      'Read a task including its full log and context bundle. Use this before starting work on a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID (e.g. T-001)' },
      },
      required: ['task_id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.task_id === 'string' ? args.task_id : '';
    const [task, log] = await Promise.all([taskService.readTask(id), logService.getLog(id)]);
    const text = `## Task\n\n${task}\n\n## Log\n\n${log}`;
    return { content: [{ type: 'text', text }] };
  };

  return { definition, handler };
}
