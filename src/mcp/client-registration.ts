import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import type { McpClientType } from '../agents/agent-types.js';
import type { ToolHandler } from './mcp-server.js';

const POLL_INTERVAL_MS = 5000;

const DEFAULTS = {
  displayName: 'MCP Client',
  model: 'unknown',
  clientType: 'human_assisted' as McpClientType,
  clientSoftware: 'unknown',
};

export interface RegisterToolResult {
  definition: Tool;
  handler: ToolHandler;
}

export function createRegisterTool(registry: AgentRegistry): RegisterToolResult {
  const definition: Tool = {
    name: 'register',
    description:
      'Register this MCP client with Oriri. Optional — defaults are applied if not called. Returns registration details including poll_interval for autonomous clients.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: {
          type: 'string',
          description: 'Human-readable name for this client',
        },
        model: {
          type: 'string',
          description: 'LLM model identifier used by this client',
        },
        client_type: {
          type: 'string',
          enum: ['autonomous', 'human_assisted'],
          description: 'autonomous: polls for updates; human_assisted: no heartbeat',
        },
        client_software: {
          type: 'string',
          description: 'Name/version of the MCP client software',
        },
      },
    },
  };

  const handler: ToolHandler = async (args): Promise<CallToolResult> => {
    const displayName =
      typeof args.display_name === 'string' ? args.display_name : DEFAULTS.displayName;
    const model = typeof args.model === 'string' ? args.model : DEFAULTS.model;
    const clientType: McpClientType =
      args.client_type === 'autonomous' || args.client_type === 'human_assisted'
        ? args.client_type
        : DEFAULTS.clientType;
    const clientSoftware =
      typeof args.client_software === 'string' ? args.client_software : DEFAULTS.clientSoftware;

    const id = `mcp-${Date.now()}`;
    const now = new Date().toISOString();
    const pollInterval = clientType === 'autonomous' ? POLL_INTERVAL_MS : undefined;

    await registry.register({
      id,
      role: 'MCP_CLIENT',
      model,
      pid: 0,
      since: now,
      lastSeen: now,
      displayName,
      clientType,
      clientSoftware,
      pollInterval,
    });

    const response: Record<string, unknown> = {
      id,
      display_name: displayName,
      model,
      client_type: clientType,
      client_software: clientSoftware,
      since: now,
    };

    if (pollInterval !== undefined) {
      response.poll_interval = pollInterval;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(response) }],
    };
  };

  return { definition, handler };
}
