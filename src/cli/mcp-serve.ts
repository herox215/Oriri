import { McpServer, createRegisterTool } from '../mcp/index.js';
import type { AgentRegistry } from '../agents/agent-registry.js';

export async function mcpServeCommand(registry: AgentRegistry): Promise<void> {
  const server = new McpServer();
  const { definition, handler } = createRegisterTool(registry);
  server.registerTool(definition, handler);
  await server.serveStdio();
}
