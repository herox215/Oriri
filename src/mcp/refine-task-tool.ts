import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { TaskType } from '../tasks/task-types.js';
import { TASK_TYPES } from '../tasks/task-types.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createRefineTaskTool(
  taskService: TaskService,
): RegisterToolResult {
  const definition: Tool = {
    name: 'refine_task',
    description:
      'Refine a draft task, promoting it to open status. ' +
      'Optionally update the task type and context. ' +
      'Only works on tasks with status "draft". ' +
      'Call this after analyzing the draft and optionally creating subtasks / setting dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The ID of the draft task to refine' },
        type: {
          type: 'string',
          enum: [...TASK_TYPES],
          description: 'Optional: correct task type (feature, bug, chore, escalation)',
        },
        context: {
          type: 'string',
          description: 'Optional: updated context bundle for the task',
        },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used as the author of the refinement.',
        },
      },
      required: ['task_id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';
    const type = typeof args.type === 'string' ? (args.type as TaskType) : undefined;
    const context = typeof args.context === 'string' ? args.context : undefined;
    const clientId = typeof args.client_id === 'string' ? args.client_id : 'mcp-anonymous';

    const { targetStatus } = await taskService.refineTask(taskId, clientId, {
      type,
      contextBundle: context,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, task_id: taskId, status: targetStatus }),
        },
      ],
    };
  };

  return { definition, handler };
}
