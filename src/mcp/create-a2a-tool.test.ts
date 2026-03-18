import { describe, it, expect, vi } from 'vitest';
import { A2AService } from '../a2a/a2a-service.js';
import { A2A_TYPES } from '../a2a/a2a-types.js';
import { InvalidA2ATypeError, PermissionDeniedError } from '../shared/errors.js';
import { createCreateA2ATool } from './create-a2a-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';
import type { AgentRegistry } from '../agents/agent-registry.js';
import { RoleService } from '../agents/role-service.js';

function makeStorage(): StorageInterface {
  const a2aMap: Record<string, string> = {};
  const a2aLogs: Record<string, string[]> = {};
  return {
    listTasks: vi.fn(() => Promise.resolve([])),
    writeTask: vi.fn(),
    readTask: vi.fn(),
    deleteTask: vi.fn(),
    appendLog: vi.fn(),
    readLog: vi.fn(),
    readStory: vi.fn(),
    appendStory: vi.fn(),
    writeStory: vi.fn(),
    readStoryArchive: vi.fn(),
    appendStoryArchive: vi.fn(),
    readActiveAgents: vi.fn(),
    writeActiveAgents: vi.fn(),
    readA2A: vi.fn((id: string) => Promise.resolve(a2aMap[id] ?? '')),
    writeA2A: vi.fn((id: string, content: string) => {
      a2aMap[id] = content;
      return Promise.resolve();
    }),
    listA2A: vi.fn(() => Promise.resolve(Object.keys(a2aMap))),
    appendA2ALog: vi.fn((id: string, line: string) => {
      if (!a2aLogs[id]) a2aLogs[id] = [];
      a2aLogs[id].push(line);
      return Promise.resolve();
    }),
    readA2ALog: vi.fn((id: string) => Promise.resolve((a2aLogs[id] ?? []).join('\n'))),
  } as unknown as StorageInterface;
}

function makeRegistry(agents: { id: string; role: string }[] = []): AgentRegistry {
  return {
    listAgents: vi.fn().mockResolvedValue(agents),
    isRegistered: vi.fn(),
    register: vi.fn(),
    deregister: vi.fn(),
    updateLastSeen: vi.fn(),
  } as unknown as AgentRegistry;
}

describe('createCreateA2ATool', () => {
  const roleService = new RoleService();

  it('creates A2A with valid type and returns id', async () => {
    const storage = makeStorage();
    const a2aService = new A2AService(storage);
    const registry = makeRegistry([{ id: 'agent-x', role: 'AGENT' }]);

    const { handler } = createCreateA2ATool(a2aService, registry, roleService);
    const result = await handler({
      type: 'merge_proposal',
      proposal: 'Merge T-001 into T-002',
      client_id: 'agent-x',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as { id: string };
    expect(typeof data.id).toBe('string');
    expect(data.id.length).toBeGreaterThan(0);
  });

  it('throws InvalidA2ATypeError for invalid type', async () => {
    const storage = makeStorage();
    const a2aService = new A2AService(storage);
    const registry = makeRegistry([{ id: 'agent-x', role: 'AGENT' }]);

    const { handler } = createCreateA2ATool(a2aService, registry, roleService);
    await expect(
      handler({ type: 'not_a_real_type', proposal: 'something', client_id: 'agent-x' }),
    ).rejects.toThrow(InvalidA2ATypeError);
  });

  it('enforces role check — MCP_CLIENT cannot create A2A', async () => {
    const storage = makeStorage();
    const a2aService = new A2AService(storage);
    const registry = makeRegistry();

    const { handler } = createCreateA2ATool(a2aService, registry, roleService);
    await expect(
      handler({ type: 'merge_proposal', proposal: 'test' }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('tool definition includes all valid A2A types in enum', () => {
    const storage = makeStorage();
    const a2aService = new A2AService(storage);
    const registry = makeRegistry();

    const { definition } = createCreateA2ATool(a2aService, registry, roleService);
    expect(definition.name).toBe('create_a2a');
    const typeSchema = definition.inputSchema.properties as Record<string, { enum?: string[] }>;
    expect(typeSchema['type']?.enum).toEqual([...A2A_TYPES]);
  });
});
