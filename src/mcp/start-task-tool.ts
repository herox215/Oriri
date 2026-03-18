import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { WorktreeManager } from '../git/worktree-manager.js';
import type { ToolHandler, RegisteredTool } from './mcp-server.js';

export function createStartTaskTool(worktreeManager: WorktreeManager): RegisteredTool {
  const definition: Tool = {
    name: 'start_task',
    description:
      'Start working on a task by creating an isolated git worktree. Returns the worktree path where the agent should make changes.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to start working on' },
      },
      required: ['task_id'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const taskId = typeof args.task_id === 'string' ? args.task_id : '';

    const result = await worktreeManager.startTask(taskId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            worktree_path: result.worktreePath,
            branch: result.branch,
            base_branch: result.baseBranch,
          }),
        },
      ],
    };
  };

  return { definition, handler };
}
