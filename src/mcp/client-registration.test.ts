import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../agents/agent-registry.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { createRegisterTool } from './client-registration.js';
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

describe('createRegisterTool', () => {
  let storage: StorageInterface;
  let registry: AgentRegistry;

  beforeEach(() => {
    storage = makeStorage();
    registry = new AgentRegistry(storage);
  });

  it('registers with all args provided', async () => {
    const { handler } = createRegisterTool(registry);

    const result = await handler({
      display_name: 'My Agent',
      model: 'claude-sonnet-4-6',
      client_type: 'autonomous',
      client_software: 'claude-code/1.0',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.display_name).toBe('My Agent');
    expect(data.model).toBe('claude-sonnet-4-6');
    expect(data.client_type).toBe('autonomous');
    expect(data.client_software).toBe('claude-code/1.0');
    expect(data.poll_interval).toBe(5000);
    expect(typeof data.id).toBe('string');
    expect(typeof data.since).toBe('string');
    expect(storage.writeActiveAgents).toHaveBeenCalledOnce();
  });

  it('applies defaults when no args provided', async () => {
    const { handler } = createRegisterTool(registry);

    const result = await handler({});

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.display_name).toBe('MCP Client');
    expect(data.model).toBe('unknown');
    expect(data.client_type).toBe('human_assisted');
    expect(data.client_software).toBe('unknown');
  });

  it('autonomous client receives poll_interval', async () => {
    const { handler } = createRegisterTool(registry);

    const result = await handler({ client_type: 'autonomous' });
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(data.poll_interval).toBe(5000);
  });

  it('human_assisted client has no poll_interval', async () => {
    const { handler } = createRegisterTool(registry);

    const result = await handler({ client_type: 'human_assisted' });
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(data.poll_interval).toBeUndefined();
  });

  it('entry appears in agents/active.md after registration', async () => {
    const { handler } = createRegisterTool(registry);

    await handler({ display_name: 'Test Client', model: 'test-model', client_type: 'autonomous' });

    const agents = await registry.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].displayName).toBe('Test Client');
    expect(agents[0].model).toBe('test-model');
    expect(agents[0].clientType).toBe('autonomous');
    expect(agents[0].role).toBe('MCP_CLIENT');
    expect(agents[0].pollInterval).toBe(5000);
  });

  it('returns MCP error result when tool definition is returned', () => {
    const { definition } = createRegisterTool(registry);

    expect(definition.name).toBe('register');
    expect(definition.inputSchema).toBeDefined();
  });
});
