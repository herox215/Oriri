import { describe, it, expect, vi } from 'vitest';
import { ConsentService } from '../a2a/consent-service.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { RoleService } from '../agents/role-service.js';
import { PermissionDeniedError } from '../shared/errors.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildA2AMarkdown } from '../a2a/a2a-markdown.js';
import { createVoteTool } from './vote-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

const OPEN_A2A = buildA2AMarkdown({
  id: 'A-001',
  type: 'merge_proposal',
  status: 'open',
  createdBy: 'agent-1',
  createdAt: '2024-01-01T00:00:00.000Z',
  description: 'Merge feature branch',
});

function makeStorage(initial?: string): StorageInterface {
  let agentsContent = initial ?? ACTIVE_AGENTS_MD;
  return {
    readA2A: vi.fn(async () => OPEN_A2A),
    writeA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    listA2A: vi.fn(),
    readA2ALog: vi.fn(),
    readActiveAgents: vi.fn(async () => agentsContent),
    writeActiveAgents: vi.fn(async (c: string) => {
      agentsContent = c;
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
  } as unknown as StorageInterface;
}

describe('createVoteTool', () => {
  it('casts a vote when called with a capable role', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const consentService = new ConsentService(storage, roleService);
    const registry = new AgentRegistry(storage);

    await registry.register({
      id: 'agent-gen',
      role: 'AGENT',
      model: 'test-model',
      pid: 0,
      since: '2024-01-01T00:00:00.000Z',
    });

    const { handler } = createVoteTool(consentService, registry);
    const result = await handler({ a2a_id: 'A-001', vote: 'YES', client_id: 'agent-gen' });

    expect(result.isError).toBeFalsy();
    expect(storage.writeA2A).toHaveBeenCalledOnce();
  });

  it('throws permission error for MCP_CLIENT role', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const consentService = new ConsentService(storage, roleService);
    const registry = new AgentRegistry(storage);
    const { handler } = createVoteTool(consentService, registry);

    // No client_id → resolves to MCP_CLIENT which cannot vote
    await expect(handler({ a2a_id: 'A-001', vote: 'YES' })).rejects.toThrow(PermissionDeniedError);
  });

  it('tool definition requires a2a_id and vote', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const consentService = new ConsentService(storage, roleService);
    const registry = new AgentRegistry(storage);
    const { definition } = createVoteTool(consentService, registry);

    expect(definition.name).toBe('vote');
    expect(definition.inputSchema.required).toContain('a2a_id');
    expect(definition.inputSchema.required).toContain('vote');
  });
});
