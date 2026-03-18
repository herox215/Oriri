import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler, RegisteredTool } from './mcp-server.js';
import { isValidComplexity } from '../tasks/task-types.js';
import { InvalidComplexityError } from '../shared/errors.js';

export function createCreateTaskTool(taskService: TaskService): RegisteredTool {
  const definition: Tool = {
    name: 'create_task',
    description: 'Create a new task on the board.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the task' },
        description: { type: 'string', description: 'Optional description with more detail' },
        complexity: {
          type: 'number',
          enum: [1, 2, 3, 5, 8, 13, 21],
          description: 'Fibonacci complexity estimate',
        },
      },
      required: ['title'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const title = typeof args.title === 'string' ? args.title : '';
    const description = typeof args.description === 'string' ? args.description : undefined;

    let complexity: 1 | 2 | 3 | 5 | 8 | 13 | 21 | undefined;
    if (args.complexity != null) {
      const value = Number(args.complexity);
      if (!isValidComplexity(value)) {
        throw new InvalidComplexityError(args.complexity);
      }
      complexity = value;
    }

    const id = await taskService.createTask({ title, description, complexity });

    return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
  };

  return { definition, handler };
}
