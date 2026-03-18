import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { OririError } from '../shared/errors.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

export interface RegisteredTool {
  definition: Tool;
  handler: ToolHandler;
}

export class McpServer {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private server: Server;
  private tools = new Map<string, RegisteredTool>();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    this.server = new Server({ name: 'oriri', version: '0.1.0' }, { capabilities: { tools: {} } });

    this.server.setRequestHandler(ListToolsRequestSchema, () =>
      Promise.resolve({
        tools: Array.from(this.tools.values()).map((t) => t.definition),
      }),
    );

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.callTool(name, (args ?? {}) as unknown as Record<string, unknown>);
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

  async serveStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
