import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { StorageReadError, TaskNotFoundError } from '../shared/errors.js';
import { createDeleteTaskTool } from './delete-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
  const logs: Record<string, string[]> = {};
  return {
    listTasks: vi.fn(async () => Object.keys(taskMap)),
    writeTask: vi.fn(async (id: string, content: string) => {
      taskMap[id] = content;
    }),
    readTask: vi.fn(async (id: string) => {
      if (!(id in taskMap)) throw new StorageReadError(id);
      return taskMap[id];
    }),
    deleteTask: vi.fn(async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete taskMap[id];
    }),
    appendLog: vi.fn(async (id: string, line: string) => {
      if (!logs[id]) logs[id] = [];
      logs[id].push(line);
    }),
    readLog: vi.fn(async (id: string) => (logs[id] ?? []).join('\n')),
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

describe('createDeleteTaskTool', () => {
  it('Phase 1: sets status to needs_human when no human input exists', async () => {
    const task = buildTaskMarkdown({
      id: 'T-001',
      title: 'Task to delete',
      type: 'feature',
      status: 'open',
      assignedTo: 'client-abc',
      createdBy: 'test',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    const taskMap = { 'T-001': task };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createDeleteTaskTool(taskService);
    const result = await handler({ task_id: 'T-001', client_id: 'client-abc' });

    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.needs_human).toBe(true);
    expect(data.deleted).toBeUndefined();

    expect(taskMap['T-001']).toContain('| status | needs_human');
  });

  it('Phase 2: deletes task when ### Human Input is present', async () => {
    const task = buildTaskMarkdown({
      id: 'T-002',
      title: 'Task with approval',
      type: 'feature',
      status: 'needs_human',
      assignedTo: 'client-abc',
      createdBy: 'test',
      createdAt: '2024-01-01T00:00:00.000Z',
      contextBundle: 'Some context\n\n### Human Input\n\nApproved for deletion',
    });
    const taskMap = { 'T-002': task };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createDeleteTaskTool(taskService);
    const result = await handler({ task_id: 'T-002', client_id: 'client-abc' });

    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.deleted).toBe(true);

    expect(storage.deleteTask).toHaveBeenCalledWith('T-002');
  });

  it('throws when task does not exist', async () => {
    const storage = makeStorage({});
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createDeleteTaskTool(taskService);
    await expect(handler({ task_id: 'T-NOPE' })).rejects.toThrow(TaskNotFoundError);
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createDeleteTaskTool(taskService);
    expect(definition.name).toBe('delete_task');
    expect(definition.inputSchema.required).toContain('task_id');
  });
});
