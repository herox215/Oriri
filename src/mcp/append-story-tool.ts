import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { StoryService } from '../story/story-service.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { AgentRole } from '../config/config-types.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

async function resolveRole(registry: AgentRegistry, clientId?: string): Promise<AgentRole> {
  if (!clientId) return 'MCP_CLIENT';
  const agents = await registry.listAgents();
  return agents.find((a) => a.id === clientId)?.role ?? 'MCP_CLIENT';
}

export function createAppendStoryTool(
  storyService: StoryService,
  registry: AgentRegistry,
): RegisterToolResult {
  const definition: Tool = {
    name: 'append_story',
    description:
      'Append an entry to the collective memory (story.md). Use this to document decisions, context, and important events.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The story entry to append' },
        client_id: {
          type: 'string',
          description: 'Your client ID from register(). Used as the author of the entry.',
        },
      },
      required: ['message'],
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const message = typeof args.message === 'string' ? args.message : '';
    const clientId = typeof args.client_id === 'string' ? args.client_id : undefined;
    const agentId = clientId ?? 'mcp-anonymous';
    const role = await resolveRole(registry, clientId);

    await storyService.appendStory(agentId, role, message);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  };

  return { definition, handler };
}
