import { describe, it, expect, vi } from 'vitest';
import { AgentRegistry } from '../agents/agent-registry.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { createGetActiveAgentsTool } from './get-active-agents-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(initial?: string): StorageInterface {
  let content = initial ?? ACTIVE_AGENTS_MD;
  return {
    readActiveAgents: vi.fn(async () => content),
    writeActiveAgents: vi.fn(async (c: string) => {
      content = c;
    }),
    readTask: vi.fn(),
    writeTask: vi.fn(),
    listTasks: vi.fn(),
    deleteTask: vi.fn(),
    appendLog: vi.fn(),
    readLog: vi.fn(),
    readStory: vi.fn(),
    appendStory: vi.fn(),
    writeStory: vi.fn(),
    readStoryArchive: vi.fn(),
    appendStoryArchive: vi.fn(),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

describe('createGetActiveAgentsTool', () => {
  it('returns empty array when no agents registered', async () => {
    const storage = makeStorage();
    const registry = new AgentRegistry(storage);
    const { handler } = createGetActiveAgentsTool(registry);

    const result = await handler({});

    expect(result.isError).toBeFalsy();
    const agents = JSON.parse((result.content[0] as { text: string }).text) as unknown[];
    expect(agents).toEqual([]);
  });

  it('returns registered agents', async () => {
    const storage = makeStorage();
    const registry = new AgentRegistry(storage);
    await registry.register({
      id: 'mcp-123',
      role: 'MCP_CLIENT',
      model: 'test-model',
      pid: 0,
      since: '2024-01-01T00:00:00.000Z',
      displayName: 'Test Client',
    });
    const { handler } = createGetActiveAgentsTool(registry);

    const result = await handler({});

    expect(result.isError).toBeFalsy();
    const agents = JSON.parse((result.content[0] as { text: string }).text) as Array<{
      id: string;
    }>;
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('mcp-123');
  });

  it('tool definition has correct name', () => {
    const storage = makeStorage();
    const registry = new AgentRegistry(storage);
    const { definition } = createGetActiveAgentsTool(registry);

    expect(definition.name).toBe('get_active_agents');
  });
});
