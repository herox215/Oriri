import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { ToolHandler } from './mcp-server.js';
import type { RegisterToolResult } from './client-registration.js';

export function createGetActiveAgentsTool(registry: AgentRegistry): RegisterToolResult {
  const definition: Tool = {
    name: 'get_active_agents',
    description: 'List all currently registered agents and MCP clients.',
    inputSchema: { type: 'object', properties: {} },
  };

  const handler: ToolHandler = async (): Promise<CallToolResult> => {
    const agents = await registry.listAgents();
    return { content: [{ type: 'text', text: JSON.stringify(agents) }] };
  };

  return { definition, handler };
}
