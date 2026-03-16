import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { TaskAlreadyClaimedError } from '../shared/errors.js';
import { createClaimTaskTool } from './claim-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
  let agentsContent = ACTIVE_AGENTS_MD;
  return {
    listTasks: vi.fn(async () => Object.keys(taskMap)),
    writeTask: vi.fn(async (id: string, content: string) => {
      taskMap[id] = content;
    }),
    readTask: vi.fn(async (id: string) => taskMap[id] ?? ''),
    deleteTask: vi.fn(),
    appendLog: vi.fn(),
    readLog: vi.fn(async () => ''),
    readStory: vi.fn(),
    appendStory: vi.fn(),
    writeStory: vi.fn(),
    readStoryArchive: vi.fn(),
    appendStoryArchive: vi.fn(),
    readActiveAgents: vi.fn(async () => agentsContent),
    writeActiveAgents: vi.fn(async (c: string) => {
      agentsContent = c;
    }),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

const openTask = buildTaskMarkdown({
  id: 'T-001',
  title: 'Open task',
  type: 'feature',
  status: 'open',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

describe('createClaimTaskTool', () => {
  it('claims an open task and returns ok', async () => {
    const taskMap = { 'T-001': openTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { handler } = createClaimTaskTool(taskService, registry, roleService);
    const result = await handler({ id: 'T-001' });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as {
      ok: boolean;
      id: string;
    };
    expect(data.ok).toBe(true);
    expect(data.id).toBe('T-001');
    expect(storage.writeTask).toHaveBeenCalled();
  });

  it('throws when task is already claimed', async () => {
    const alreadyClaimed = buildTaskMarkdown({
      id: 'T-002',
      title: 'Claimed task',
      type: 'bug',
      status: 'open',
      assignedTo: 'another-agent',
      createdBy: 'test',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    const storage = makeStorage({ 'T-002': alreadyClaimed });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { handler } = createClaimTaskTool(taskService, registry, roleService);
    await expect(handler({ id: 'T-002' })).rejects.toThrow(TaskAlreadyClaimedError);
  });

  it('uses client_id as the agentId when provided', async () => {
    const taskMap = { 'T-001': openTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    await registry.register({
      id: 'client-abc',
      role: 'MCP_CLIENT',
      model: 'test',
      pid: 0,
      since: '2024-01-01T00:00:00.000Z',
    });

    const { handler } = createClaimTaskTool(taskService, registry, roleService);
    const result = await handler({ id: 'T-001', client_id: 'client-abc' });

    expect(result.isError).toBeFalsy();
    // The task markdown should be updated with assigned_to = client-abc
    expect(taskMap['T-001']).toContain('client-abc');
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { definition } = createClaimTaskTool(taskService, registry, roleService);
    expect(definition.name).toBe('claim_task');
    expect(definition.inputSchema.required).toContain('id');
  });
});
