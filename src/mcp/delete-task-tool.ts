import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createDeleteTaskTool(taskService: TaskService): RegisterToolResult {
  const definition: Tool = {
    name: 'delete_task',
    description:
      'Delete a task. Two-phase human gate: first call sets status to needs_human. ' +
      'After human approval (### Human Input in context), call again to delete.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to delete (e.g. T-001)' },
        client_id: {
          type: 'string',
          description: 'Your client ID from register().',
        },
      },
      required: ['task_id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;
    const agentId = clientId ?? 'mcp-anonymous';

    const taskMarkdown = await taskService.readTask(taskId);

    // Phase 2: Human has approved — delete the task
    if (taskMarkdown.includes('### Human Input')) {
      await taskService.appendTaskLog(taskId, agentId, 'task deleted after human approval');
      await taskService.deleteTask(taskId);

      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, deleted: true }) }],
      };
    }

    // Phase 1: Request human approval
    await taskService.appendTaskLog(taskId, agentId, 'deletion requested — awaiting human approval');
    await taskService.updateStatus(taskId, 'needs_human', agentId);

    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, needs_human: true }) }],
    };
  };

  return { definition, handler };
}
