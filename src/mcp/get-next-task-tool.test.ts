import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { createGetNextTaskTool } from './get-next-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
  let agentsContent = ACTIVE_AGENTS_MD;
  const logs: Record<string, string> = {};

  return {
    listTasks: vi.fn(async () => Object.keys(taskMap)),
    writeTask: vi.fn(async (id: string, content: string) => {
      taskMap[id] = content;
    }),
    readTask: vi.fn(async (id: string) => taskMap[id] ?? ''),
    deleteTask: vi.fn(),
    appendLog: vi.fn(async (id: string, line: string) => {
      logs[id] = (logs[id] ?? '') + line + '\n';
    }),
    readLog: vi.fn(async (id: string) => logs[id] ?? ''),
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

const openFeatureTask = buildTaskMarkdown({
  id: 'T-001',
  title: 'Open feature task',
  type: 'feature',
  status: 'open',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
  contextBundle: 'needs frontend work',
});

const claimedTask = buildTaskMarkdown({
  id: 'T-002',
  title: 'Already claimed',
  type: 'bug',
  status: 'open',
  assignedTo: 'agent-x',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

const doneTask = buildTaskMarkdown({
  id: 'T-003',
  title: 'Done task',
  type: 'chore',
  status: 'done',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

describe('createGetNextTaskTool', () => {
  it('returns the first open unclaimed task for MCP_CLIENT role', async () => {
    const storage = makeStorage({ 'T-001': openFeatureTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { handler } = createGetNextTaskTool(taskService, registry, logService);
    const result = await handler({});

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Open feature task');
    expect(text).toContain('## Task');
    expect(text).toContain('## Log');
  });

  it('skips already claimed tasks', async () => {
    const storage = makeStorage({ 'T-002': claimedTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { handler } = createGetNextTaskTool(taskService, registry, logService);
    const result = await handler({});

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No claimable tasks found');
  });

  it('skips tasks with non-claimable status', async () => {
    const storage = makeStorage({ 'T-003': doneTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { handler } = createGetNextTaskTool(taskService, registry, logService);
    const result = await handler({});

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No claimable tasks found');
  });

  it('filters by capabilities keyword', async () => {
    const storage = makeStorage({ 'T-001': openFeatureTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { handler } = createGetNextTaskTool(taskService, registry, logService);

    // Task contains "frontend" — should match
    const hit = await handler({ capabilities: ['frontend'] });
    expect((hit.content[0] as { text: string }).text).toContain('Open feature task');

    // Task does not contain "backend" — should not match
    const miss = await handler({ capabilities: ['backend'] });
    expect((miss.content[0] as { text: string }).text).toContain('No claimable tasks found');
  });

  it('resolves role from client_id', async () => {
    const storage = makeStorage({ 'T-001': openFeatureTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    await registry.register({
      id: 'client-1',
      role: 'GENERALIST',
      model: 'test',
      pid: 0,
      since: '2024-01-01T00:00:00.000Z',
    });

    const { handler } = createGetNextTaskTool(taskService, registry, logService);
    const result = await handler({ client_id: 'client-1' });

    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { text: string }).text).toContain('Open feature task');
  });

  it('tool definition has correct name', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    const { definition } = createGetNextTaskTool(taskService, registry, logService);
    expect(definition.name).toBe('get_next_task');
  });
});
