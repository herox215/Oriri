import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';
import { extractStatusFromMarkdown } from '../tasks/task-markdown.js';

export function createListTasksTool(taskService: TaskService): RegisterToolResult {
  const definition: Tool = {
    name: 'list_tasks',
    description: 'List all task IDs. Optionally filter by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Filter by task status (open, planning, executing, waiting_for_tool, waiting_for_agent, needs_human, awaiting_review, done)',
        },
      },
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const statusFilter = typeof args.status === 'string' ? args.status : undefined;
    const ids = await taskService.listTasks();

    let result: string[];
    if (statusFilter) {
      const filtered: string[] = [];
      for (const id of ids) {
        const markdown = await taskService.readTask(id);
        const status = extractStatusFromMarkdown(markdown);
        if (status === statusFilter) {
          filtered.push(id);
        }
      }
      result = filtered;
    } else {
      result = ids;
    }

    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  };

  return { definition, handler };
}
