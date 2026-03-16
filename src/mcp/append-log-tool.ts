import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LogService } from '../logs/log-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createAppendLogTool(logService: LogService): RegisterToolResult {
  const definition: Tool = {
    name: 'append_log',
    description: 'Append a log entry to a task activity log.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to log against (e.g. T-001)' },
        message: { type: 'string', description: 'Log message to append' },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used as the author of the log entry.',
        },
      },
      required: ['task_id', 'message'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const id = typeof args.task_id === 'string' ? args.task_id : '';
    const message = typeof args.message === 'string' ? args.message : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : 'mcp-anonymous';

    await logService.appendLog(id, clientId, message);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
