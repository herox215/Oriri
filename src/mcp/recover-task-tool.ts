import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FileRecoveryService } from '../tasks/file-recovery-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createRecoverTaskTool(recoveryService: FileRecoveryService): RegisterToolResult {
  const definition: Tool = {
    name: 'recover_task',
    description:
      'Recover a missing task file. Attempts reconstruction in order: agent-provided content → log file → story.md mentions → A2A warning to human.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID of the missing task (e.g. task-abc123)' },
        agentId: { type: 'string', description: 'ID of the agent requesting recovery' },
        taskContent: {
          type: 'string',
          description:
            'Optional: the full markdown content of the task from agent memory. If provided, the task is reconstructed immediately from this content.',
        },
      },
      required: ['taskId', 'agentId'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.taskId === 'string' ? args.taskId : '';
    const agentId = typeof args.agentId === 'string' ? args.agentId : '';
    const taskContent = typeof args.taskContent === 'string' ? args.taskContent : undefined;

    const result = await recoveryService.recoverTask(taskId, agentId, taskContent);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  };

  return { definition, handler };
}
