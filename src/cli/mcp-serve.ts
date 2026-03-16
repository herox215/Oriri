import { McpServer } from '../mcp/index.js';

export async function mcpServeCommand(): Promise<void> {
  const server = new McpServer();
  await server.serveStdio();
}
