import { describe, it, expect, vi } from 'vitest';
import { RoleService } from '../agents/role-service.js';
import { LogService } from '../logs/log-service.js';
import { TaskService } from '../tasks/task-service.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { TaskNotDraftError } from '../shared/errors.js';
import { createRefineTaskTool } from './refine-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
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
    readActiveAgents: vi.fn(async () => ''),
    writeActiveAgents: vi.fn(),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

const draftTask = buildTaskMarkdown({
  id: 'T-001',
  title: 'Draft idea',
  type: 'chore',
  status: 'draft',
  createdBy: 'cli',
  createdAt: '2026-03-17T00:00:00.000Z',
});

const openTask = buildTaskMarkdown({
  id: 'T-002',
  title: 'Open task',
  type: 'feature',
  status: 'open',
  createdBy: 'test',
  createdAt: '2026-03-17T00:00:00.000Z',
});

describe('createRefineTaskTool', () => {
  it('refines a draft task and returns ok', async () => {
    const taskMap = { 'T-001': draftTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createRefineTaskTool(taskService);
    const result = await handler({ task_id: 'T-001' });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as {
      ok: boolean;
      task_id: string;
    };
    expect(data.ok).toBe(true);
    expect(taskMap['T-001']).toContain('| status | open |');
  });

  it('throws TaskNotDraftError for non-draft task', async () => {
    const storage = makeStorage({ 'T-002': openTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createRefineTaskTool(taskService);
    await expect(handler({ task_id: 'T-002' })).rejects.toThrow(TaskNotDraftError);
  });

  it('updates type when provided', async () => {
    const taskMap = { 'T-001': draftTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createRefineTaskTool(taskService);
    await handler({ task_id: 'T-001', type: 'feature' });

    expect(taskMap['T-001']).toContain('| type | feature |');
    expect(taskMap['T-001']).toContain('| status | open |');
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createRefineTaskTool(taskService);
    expect(definition.name).toBe('refine_task');
    expect(definition.inputSchema.required).toContain('task_id');
  });
});
