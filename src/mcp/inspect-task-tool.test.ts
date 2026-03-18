import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { TaskNotFoundError, StorageReadError } from '../shared/errors.js';
import { createInspectTaskTool } from './inspect-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
  const logs: Record<string, string> = {};
  return {
    listTasks: vi.fn(async () => Object.keys(taskMap)),
    writeTask: vi.fn(),
    readTask: vi.fn(async (id: string) => {
      if (!taskMap[id]) throw new StorageReadError(id);
      return taskMap[id];
    }),
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
    readActiveAgents: vi.fn(async () => ACTIVE_AGENTS_MD),
    writeActiveAgents: vi.fn(),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

describe('createInspectTaskTool', () => {
  it('returns task and log combined', async () => {
    const taskMarkdown = buildTaskMarkdown({
      id: 'T-001',
      title: 'My task',
      type: 'feature',
      status: 'open',
      createdBy: 'test',
      createdAt: '2024-01-01T00:00:00.000Z',
      contextBundle: 'important context here',
    });
    const storage = makeStorage({ 'T-001': taskMarkdown });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createInspectTaskTool(taskService);
    const result = await handler({ task_id: 'T-001' });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('## Task');
    expect(text).toContain('My task');
    expect(text).toContain('important context here');
    expect(text).toContain('## Log');
  });

  it('throws TaskNotFoundError for unknown task', async () => {
    const storage = makeStorage({});
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createInspectTaskTool(taskService);
    await expect(handler({ task_id: 'T-999' })).rejects.toThrow(TaskNotFoundError);
  });

  it('tool definition has correct name and required id', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createInspectTaskTool(taskService);
    expect(definition.name).toBe('inspect_task');
    expect(definition.inputSchema.required).toContain('task_id');
  });
});
