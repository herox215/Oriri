import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler, RegisteredTool } from './mcp-server.js';

export function createReadTaskTool(taskService: TaskService): RegisteredTool {
  const definition: Tool = {
    name: 'read_task',
    description: 'Read a task and return its structured details.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The ID of the task to read' },
      },
      required: ['task_id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';
    const details = await taskService.getTaskDetails(taskId);

    return { content: [{ type: 'text', text: JSON.stringify(details) }] };
  };

  return { definition, handler };
}
