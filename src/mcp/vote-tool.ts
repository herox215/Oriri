import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ConsentService } from '../a2a/consent-service.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { AgentRole } from '../config/config-types.js';
import type { VoteValue } from '../a2a/consent-service.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

async function resolveRole(registry: AgentRegistry, clientId?: string): Promise<AgentRole> {
  if (!clientId) return 'MCP_CLIENT';
  const agents = await registry.listAgents();
  return agents.find((a) => a.id === clientId)?.role ?? 'MCP_CLIENT';
}

export function createVoteTool(
  consentService: ConsentService,
  registry: AgentRegistry,
): RegisterToolResult {
  const definition: Tool = {
    name: 'vote',
    description: 'Cast a vote on an A2A proposal. Requires a role with voting permission.',
    inputSchema: {
      type: 'object',
      properties: {
        a2a_id: { type: 'string', description: 'A2A task ID to vote on (e.g. A-001)' },
        vote: {
          type: 'string',
          enum: ['YES', 'NO', 'ABSTAIN'],
          description: 'Your vote',
        },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used to look up your role.',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for your vote',
        },
      },
      required: ['a2a_id', 'vote'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const a2aId = typeof args.a2a_id === 'string' ? args.a2a_id : '';
    const vote = typeof args.vote === 'string' ? (args.vote as VoteValue) : 'ABSTAIN';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;
    const reason = typeof args.reason === 'string' ? args.reason : undefined;

    const role = await resolveRole(registry, clientId);
    const agentId = clientId ?? 'mcp-anonymous';

    await consentService.vote(a2aId, agentId, role, vote, reason);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
