import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DeadlockDetector } from '../tasks/deadlock-detector.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createCheckDeadlocksTool(deadlockDetector: DeadlockDetector): RegisterToolResult {
  const definition: Tool = {
    name: 'check_deadlocks',
    description:
      'Check the task dependency graph for circular dependencies. Creates A2A tasks for any deadlocks found.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Your client ID from register()',
        },
      },
      required: [],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;
    const agentId = clientId ?? 'mcp-anonymous';

    const createdA2AIds = await deadlockDetector.checkDeadlocks(agentId);

    return {
      content: [{ type: 'text', text: JSON.stringify({ created_a2a_ids: createdA2AIds }) }],
    };
  };

  return { definition, handler };
}
