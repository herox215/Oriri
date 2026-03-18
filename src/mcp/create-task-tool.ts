import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskService } from '../tasks/task-service.js';
import type { ToolHandler, RegisteredTool } from './mcp-server.js';

export function createCreateTaskTool(taskService: TaskService): RegisteredTool {
  const definition: Tool = {
    name: 'create_task',
    description: 'Create a new task on the board.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the task' },
        description: { type: 'string', description: 'Optional description with more detail' },
      },
      required: ['title'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const title = typeof args.title === 'string' ? args.title : '';
    const description = typeof args.description === 'string' ? args.description : undefined;

    const id = await taskService.createTask({ title, description });

    return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
  };

  return { definition, handler };
}
