import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { TaskNotFoundError, StorageReadError } from '../shared/errors.js';
import { createUpdateTaskTool } from './update-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
  const logs: Record<string, string[]> = {};
  return {
    listTasks: vi.fn(() => Promise.resolve(Object.keys(taskMap))),
    writeTask: vi.fn((id: string, content: string) => {
      taskMap[id] = content;
      return Promise.resolve();
    }),
    readTask: vi.fn((id: string) => {
      if (!taskMap[id]) return Promise.reject(new StorageReadError(`task-${id}.md`));
      return Promise.resolve(taskMap[id]);
    }),
    deleteTask: vi.fn(),
    appendLog: vi.fn((id: string, line: string) => {
      if (!logs[id]) logs[id] = [];
      logs[id].push(line);
      return Promise.resolve();
    }),
    readLog: vi.fn((id: string) => Promise.resolve((logs[id] ?? []).join('\n'))),
    readStory: vi.fn(),
    appendStory: vi.fn(),
    writeStory: vi.fn(),
    readStoryArchive: vi.fn(),
    appendStoryArchive: vi.fn(),
    readActiveAgents: vi.fn(() => Promise.resolve(ACTIVE_AGENTS_MD)),
    writeActiveAgents: vi.fn(),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

const existingTask = buildTaskMarkdown({
  id: 'T-001',
  title: 'Existing task',
  type: 'feature',
  status: 'open',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

describe('createUpdateTaskTool', () => {
  it('writes new content and logs the change', async () => {
    const taskMap = { 'T-001': existingTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createUpdateTaskTool(taskService);
    const newContent = '# Updated\n\nNew content';
    const result = await handler({ task_id: 'T-001', content: newContent, client_id: 'agent-x' });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as { ok: boolean };
    expect(data.ok).toBe(true);

    expect(taskMap['T-001']).toBe(newContent);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(storage.appendLog).toHaveBeenCalledWith(
      'T-001',
      expect.stringContaining('task content updated'),
    );
  });

  it('throws TaskNotFoundError for unknown task ID', async () => {
    const storage = makeStorage({});
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createUpdateTaskTool(taskService);
    await expect(handler({ task_id: 'T-999', content: 'x' })).rejects.toThrow(TaskNotFoundError);
  });

  it('uses mcp-anonymous when no client_id provided', async () => {
    const taskMap = { 'T-001': existingTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createUpdateTaskTool(taskService);
    await handler({ task_id: 'T-001', content: '# new' });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(storage.appendLog).toHaveBeenCalledWith('T-001', expect.stringContaining('mcp-anonymous'));
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createUpdateTaskTool(taskService);
    expect(definition.name).toBe('update_task');
    expect(definition.inputSchema.required).toContain('task_id');
    expect(definition.inputSchema.required).toContain('content');
  });
});
