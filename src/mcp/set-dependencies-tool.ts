import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createSetDependenciesTool(
  taskService: TaskService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'set_dependencies',
    description: 'Set or replace the dependencies of a task. Pass an empty array to clear dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update (e.g. T-001)' },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of task IDs this task depends on (e.g. ["T-002", "T-003"])',
        },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used as the author of the change.',
        },
      },
      required: ['task_id', 'dependencies'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';
    const dependencies = Array.isArray(args.dependencies) ? (args.dependencies as string[]) : [];
    const clientId = typeof args.client_id === 'string' ? args.client_id : 'mcp-anonymous';

    await taskService.setDependencies(taskId, dependencies, clientId);

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
