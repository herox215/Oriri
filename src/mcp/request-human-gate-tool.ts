import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { LogService } from '../logs/log-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createRequestHumanGateTool(
  taskService: TaskService,
  logService: LogService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'request_human_gate',
    description:
      'Flag a task as requiring human review. Sets status to needs_human and logs the reason.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID (e.g. T-001)' },
        reason: { type: 'string', description: 'Why human review is needed' },
        client_id: {
          type: 'string',
          description: 'Your client ID from register().',
        },
      },
      required: ['id', 'reason'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.id === 'string' ? args.id : '';
    const reason = typeof args.reason === 'string' ? args.reason : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;

    const agentId = clientId ?? 'mcp-anonymous';
    await logService.appendLog(id, agentId, `human gate requested: ${reason}`);
    await taskService.updateStatus(id, 'needs_human', agentId);

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
