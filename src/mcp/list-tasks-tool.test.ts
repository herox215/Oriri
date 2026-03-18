import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { createListTasksTool } from './list-tasks-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

const OPEN_TASK = `# Task T-001\n\n| Field | Value |\n|-------|-------|\n| status | open |\n| type | feature |\n`;
const DONE_TASK = `# Task T-002\n\n| Field | Value |\n|-------|-------|\n| status | done |\n| type | bug |\n`;

function makeStorage(ids = ['T-001', 'T-002']): StorageInterface {
  const tasks: Record<string, string> = {
    'T-001': OPEN_TASK,
    'T-002': DONE_TASK,
  };
  return {
    listTasks: vi.fn(async () => ids),
    readTask: vi.fn(async (id: string) => tasks[id] ?? ''),
    writeTask: vi.fn(),
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
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
    readHumanTask: vi.fn(),
    writeHumanTask: vi.fn(),
    listHumanTasks: vi.fn().mockResolvedValue([]),
    deleteHumanTask: vi.fn(),
    appendHumanTaskLog: vi.fn(),
    readHumanTaskLog: vi.fn().mockResolvedValue(''),
  } as unknown as StorageInterface;
}

describe('createListTasksTool', () => {
  it('returns all task IDs without filter', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const { handler } = createListTasksTool(taskService);

    const result = await handler({});

    expect(result.isError).toBeFalsy();
    const ids = JSON.parse((result.content[0] as { text: string }).text) as string[];
    expect(ids).toEqual(['T-001', 'T-002']);
  });

  it('filters by status when provided', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const { handler } = createListTasksTool(taskService);

    const result = await handler({ status: 'open' });

    expect(result.isError).toBeFalsy();
    const ids = JSON.parse((result.content[0] as { text: string }).text) as string[];
    expect(ids).toEqual(['T-001']);
  });

  it('returns empty array when no tasks match filter', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const { handler } = createListTasksTool(taskService);

    const result = await handler({ status: 'executing' });

    expect(result.isError).toBeFalsy();
    const ids = JSON.parse((result.content[0] as { text: string }).text) as string[];
    expect(ids).toEqual([]);
  });

  it('tool definition has correct name', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const { definition } = createListTasksTool(taskService);

    expect(definition.name).toBe('list_tasks');
  });
});
