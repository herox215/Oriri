import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createUpdateTaskTool(taskService: TaskService): RegisterToolResult {
  const definition: Tool = {
    name: 'update_task',
    description: 'Replace the full content of a task.md file. Creates a log entry on every change.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update (e.g. T-001)' },
        content: { type: 'string', description: 'New full markdown content for the task file' },
        client_id: { type: 'string', description: 'Your client ID from register()' },
        updated_by: {
          type: 'string',
          description: 'Identity of who is making this update. Falls back to client_id, then mcp-anonymous.',
        },
      },
      required: ['task_id', 'content'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.task_id === 'string' ? args.task_id : '';
    const content = typeof args.content === 'string' ? args.content : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;

    const explicitUpdatedBy = typeof args.updated_by === 'string' ? args.updated_by : undefined;
    const agentId = explicitUpdatedBy ?? clientId ?? 'mcp-anonymous';

    await taskService.updateTaskContent(id, content);
    await taskService.appendTaskLog(id, agentId, 'task content updated');

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
