import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler, RegisteredTool } from './mcp-server.js';
import type { SearchTasksFilter } from '../tasks/task-types.js';
import { isValidComplexity } from '../tasks/task-types.js';
import { InvalidComplexityError } from '../shared/errors.js';

export function createSearchTasksTool(taskService: TaskService): RegisteredTool {
  const definition: Tool = {
    name: 'search_tasks',
    description:
      'Search tasks with optional filters. Returns all tasks when called without arguments.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Case-insensitive substring match on the task title',
        },
        status: {
          type: 'string',
          enum: ['open', 'done'],
          description: 'Filter by task status',
        },
        complexity: {
          type: 'number',
          enum: [1, 2, 3, 5, 8, 13, 21],
          description: 'Filter by Fibonacci complexity',
        },
      },
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const filter: SearchTasksFilter = {};

    if (typeof args.query === 'string') {
      filter.query = args.query;
    }

    if (args.status === 'open' || args.status === 'done') {
      filter.status = args.status;
    }

    if (args.complexity != null) {
      const value = Number(args.complexity);
      if (!isValidComplexity(value)) {
        throw new InvalidComplexityError(args.complexity);
      }
      filter.complexity = value;
    }

    const results = await taskService.searchTasks(filter);

    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  };

  return { definition, handler };
}
