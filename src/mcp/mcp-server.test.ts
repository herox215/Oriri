import { describe, it, expect } from 'vitest';
import { McpServer } from './mcp-server.js';
import { OririError } from '../shared/errors.js';

describe('McpServer', () => {
  it('registers and exposes tools for discovery', async () => {
    const server = new McpServer();

    server.registerTool(
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      },
      async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    );

    // Verify the tool is registered internally
    const registered = (server as unknown as { tools: Map<string, unknown> }).tools;
    expect(registered.has('test_tool')).toBe(true);
  });

  it('returns multiple registered tools', () => {
    const server = new McpServer();

    server.registerTool(
      { name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'a' }] }),
    );
    server.registerTool(
      { name: 'tool_b', description: 'Tool B', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'b' }] }),
    );

    const registered = (server as unknown as { tools: Map<string, unknown> }).tools;
    expect(registered.size).toBe(2);
    expect(registered.has('tool_a')).toBe(true);
    expect(registered.has('tool_b')).toBe(true);
  });

  it('handler returns error result for OririError', async () => {
    const server = new McpServer();

    server.registerTool(
      {
        name: 'failing_tool',
        description: 'Throws',
        inputSchema: { type: 'object', properties: {} },
      },
      async () => {
        throw new OririError('something went wrong', 'SOME_ERROR');
      },
    );

    const result = await server.callTool('failing_tool', {});
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'something went wrong' });
  });
});
