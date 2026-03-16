import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { A2AService } from '../a2a/a2a-service.js';
import { A2A_TYPES } from '../a2a/a2a-types.js';
import type { A2AType } from '../a2a/a2a-types.js';
import { InvalidA2ATypeError } from '../shared/errors.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createCreateA2ATool(a2aService: A2AService): RegisterToolResult {
  const definition: Tool = {
    name: 'create_a2a',
    description: 'Create an Agent-to-Agent coordination task. Used to signal proposals, conflicts, or deadlocks to other agents.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [...A2A_TYPES],
          description: 'A2A task type',
        },
        proposal: {
          type: 'string',
          description: 'Description of the proposal or issue',
        },
        target_task_id: {
          type: 'string',
          description: 'Optional task ID this A2A relates to',
        },
        client_id: {
          type: 'string',
          description: 'Your client ID from register()',
        },
      },
      required: ['type', 'proposal'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const type = typeof args.type === 'string' ? args.type : '';
    const proposal = typeof args.proposal === 'string' ? args.proposal : '';
    const targetTaskId = typeof args.target_task_id === 'string' ? args.target_task_id : undefined;
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;

    if (!(A2A_TYPES as readonly string[]).includes(type)) {
      throw new InvalidA2ATypeError(type);
    }

    const agentId = clientId ?? 'mcp-anonymous';
    const id = await a2aService.createA2A({
      type: type as A2AType,
      createdBy: agentId,
      description: proposal,
      targetTaskId,
    });

    return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
  };

  return { definition, handler };
}
