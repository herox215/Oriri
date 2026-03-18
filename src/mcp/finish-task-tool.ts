import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { WorktreeManager } from '../git/worktree-manager.js';
import type { ToolHandler, RegisteredTool } from './mcp-server.js';
import { MergeConflictError } from '../shared/errors.js';

export function createFinishTaskTool(worktreeManager: WorktreeManager): RegisteredTool {
  const definition: Tool = {
    name: 'finish_task',
    description:
      'Finish a task by merging the worktree branch back into the current branch, cleaning up the worktree, and marking the task as done.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to finish' },
      },
      required: ['task_id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';

    try {
      const result = await worktreeManager.finishTask(taskId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error: unknown) {
      if (error instanceof MergeConflictError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: false, conflict_files: error.conflictFiles }),
            },
          ],
          isError: true,
        };
      }
      throw error;
    }
  };

  return { definition, handler };
}
