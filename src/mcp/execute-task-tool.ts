import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler, RegisteredTool } from './mcp-server.js';

export function createExecuteTaskTool(taskService: TaskService): RegisteredTool {
  const definition: Tool = {
    name: 'execute_task',
    description: 'Mark a task as done.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to complete' },
      },
      required: ['task_id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';

    await taskService.completeTask(taskId);

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, status: 'done' }) }] };
  };

  return { definition, handler };
}
