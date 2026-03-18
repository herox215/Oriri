import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { PermissionDeniedError } from '../shared/errors.js';
import { createCompleteTaskTool } from './complete-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
  const logs: Record<string, string[]> = {};
  return {
    listTasks: vi.fn(async () => Object.keys(taskMap)),
    writeTask: vi.fn(async (id: string, content: string) => {
      taskMap[id] = content;
    }),
    readTask: vi.fn(async (id: string) => taskMap[id] ?? ''),
    deleteTask: vi.fn(),
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

const assignedTask = buildTaskMarkdown({
  id: 'T-001',
  title: 'Assigned task',
  type: 'feature',
  status: 'planning',
  assignedTo: 'client-abc',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

const unassignedTask = buildTaskMarkdown({
  id: 'T-002',
  title: 'Unassigned task',
  type: 'bug',
  status: 'open',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

describe('createCompleteTaskTool', () => {
  it('sets status to done and writes summary to log', async () => {
    const taskMap = { 'T-001': assignedTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createCompleteTaskTool(taskService, logService);
    const result = await handler({ task_id: 'T-001', summary: 'all done', client_id: 'client-abc' });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as { ok: boolean };
    expect(data.ok).toBe(true);

    // status updated to done
    expect(taskMap['T-001']).toContain('| status | done');

    // summary logged
    expect(storage.appendLog).toHaveBeenCalledWith(
      'T-001',
      expect.stringContaining('completed: all done'),
    );
  });

  it('throws PermissionDeniedError when client_id does not match assigned_to', async () => {
    const storage = makeStorage({ 'T-001': assignedTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createCompleteTaskTool(taskService, logService);
    await expect(
      handler({ task_id: 'T-001', summary: 'done', client_id: 'wrong-client' }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('completes task without client_id check when no client_id provided', async () => {
    const taskMap = { 'T-002': unassignedTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createCompleteTaskTool(taskService, logService);
    const result = await handler({ task_id: 'T-002', summary: 'finished' });

    expect(result.isError).toBeFalsy();
    expect(taskMap['T-002']).toContain('| status | done');
  });

  it('allows completing H2A tasks', async () => {
    const h2aTask = buildTaskMarkdown({
      id: 'T-H2A',
      title: 'Delete something',
      type: 'h2a',
      status: 'executing',
      assignedTo: 'client-abc',
      createdBy: 'cli',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    const taskMap = { 'T-H2A': h2aTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createCompleteTaskTool(taskService, logService);
    const result = await handler({ task_id: 'T-H2A', summary: 'done', client_id: 'client-abc' });

    expect(result.isError).toBeFalsy();
    expect(taskMap['T-H2A']).toContain('| status | done');
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createCompleteTaskTool(taskService, logService);
    expect(definition.name).toBe('complete_task');
    expect(definition.inputSchema.required).toContain('task_id');
    expect(definition.inputSchema.required).toContain('summary');
  });
});
