import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from './tool-registry.js';
import type { ToolDefinition } from './tool-types.js';

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `Description of ${name}`,
    inputSchema: { type: 'object', properties: {} },
    handler: vi.fn().mockResolvedValue({ content: `result from ${name}` }),
  };
}

describe('ToolRegistry', () => {
  it('should register and retrieve a tool', () => {
    const registry = new ToolRegistry();
    const tool = makeTool('read_file');

    registry.register(tool);

    expect(registry.get('read_file')).toBe(tool);
  });

  it('should return undefined for unknown tool', () => {
    const registry = new ToolRegistry();

    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should register multiple tools at once', () => {
    const registry = new ToolRegistry();

    registry.registerAll([makeTool('a'), makeTool('b'), makeTool('c')]);

    expect(registry.get('a')).toBeDefined();
    expect(registry.get('b')).toBeDefined();
    expect(registry.get('c')).toBeDefined();
  });

  it('should execute a registered tool', async () => {
    const registry = new ToolRegistry();
    const tool = makeTool('read_file');
    registry.register(tool);

    const result = await registry.execute('read_file', { path: 'test.ts' });

    expect(result.content).toBe('result from read_file');
    expect(tool.handler).toHaveBeenCalledWith({ path: 'test.ts' });
  });

  it('should return error for executing unknown tool', async () => {
    const registry = new ToolRegistry();

    const result = await registry.execute('nonexistent', {});

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unknown tool');
  });

  it('should list definitions in LLM format', () => {
    const registry = new ToolRegistry();
    registry.registerAll([makeTool('read_file'), makeTool('write_file')]);

    const defs = registry.listDefinitions();

    expect(defs).toHaveLength(2);
    expect(defs[0]).toEqual({
      name: 'read_file',
      description: 'Description of read_file',
      input_schema: { type: 'object', properties: {} },
    });
    // handler should not be in the output
    expect(defs[0]).not.toHaveProperty('handler');
  });
});
