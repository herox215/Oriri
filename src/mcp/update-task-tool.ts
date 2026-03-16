import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createUpdateTaskTool(
  taskService: TaskService,
  logService: LogService,
  storage: StorageInterface,
): RegisterToolResult {
  const definition: Tool = {
    name: 'update_task',
    description: 'Replace the full content of a task.md file. Creates a log entry on every change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to update (e.g. T-001)' },
        content: { type: 'string', description: 'New full markdown content for the task file' },
        client_id: { type: 'string', description: 'Your client ID from register()' },
      },
      required: ['id', 'content'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.id === 'string' ? args.id : '';
    const content = typeof args.content === 'string' ? args.content : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;

    // Validate task exists (throws TaskNotFoundError if not)
    await taskService.readTask(id);

    const agentId = clientId ?? 'mcp-anonymous';
    await storage.writeTask(id, content);
    await logService.appendLog(id, agentId, 'task content updated');

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
