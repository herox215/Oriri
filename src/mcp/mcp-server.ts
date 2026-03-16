import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { OririError } from '../shared/errors.js';
import type { AgentRegistry } from '../agents/agent-registry.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

export interface RegisteredTool {
  definition: Tool;
  handler: ToolHandler;
}

export class McpServer {
  private server: Server;
  private tools = new Map<string, RegisteredTool>();
  private registry?: AgentRegistry;
  private registeredAgentId?: string;

  constructor() {
    this.server = new Server(
      { name: 'oriri', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.tools.values()).map((t) => t.definition),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.callTool(name, (args ?? {}) as Record<string, unknown>);
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      return await tool.handler(args);
    } catch (error) {
      const message = error instanceof OririError ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
      };
    }
  }

  registerTool(definition: Tool, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  setRegistry(registry: AgentRegistry): void {
    this.registry = registry;
  }

  async serveStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (this.registry) {
      const clientVersion = this.server.getClientVersion();
      const clientName = clientVersion?.name ?? 'unknown';
      const agentId = `mcp-${Date.now()}`;
      this.registeredAgentId = agentId;

      try {
        await this.registry.register({
          id: agentId,
          role: 'MCP_CLIENT',
          model: 'unknown',
          pid: 0,
          since: new Date().toISOString(),
          displayName: clientName,
          clientType: 'human_assisted',
          clientSoftware: clientName,
        });
      } catch {
        // Registration is best-effort — don't block on failure
      }
    }

    this.server.onclose = async () => {
      if (this.registry && this.registeredAgentId) {
        try {
          await this.registry.deregister(this.registeredAgentId);
        } catch {
          // Deregistration is best-effort
        }
      }
    };
  }
}
