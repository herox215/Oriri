import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import { extractAssignedToFromMarkdown } from '../tasks/task-markdown.js';
import { PermissionDeniedError } from '../shared/errors.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createCompleteTaskTool(
  taskService: TaskService,
  logService: LogService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'complete_task',
    description:
      'Mark a task as done and write a completion summary to the log. Only the assigned agent can complete the task.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID to complete (e.g. T-001)' },
        summary: { type: 'string', description: 'Short summary of what was done' },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Must match the assigned_to field.',
        },
      },
      required: ['id', 'summary'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.id === 'string' ? args.id : '';
    const summary = typeof args.summary === 'string' ? args.summary : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;

    const taskMarkdown = await taskService.readTask(id);
    const assignedTo = extractAssignedToFromMarkdown(taskMarkdown);

    if (clientId && assignedTo !== clientId) {
      throw new PermissionDeniedError(
        'complete task',
        clientId,
        `task is assigned to ${assignedTo ?? 'nobody'}`,
      );
    }

    const agentId = clientId ?? 'mcp-anonymous';
    await logService.appendLog(id, agentId, `completed: ${summary}`);
    await taskService.updateStatus(id, 'done', agentId);

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
