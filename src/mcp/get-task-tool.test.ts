import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { createGetTaskTool } from './get-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskContent = '# Task', logContent = 'log line'): StorageInterface {
  return {
    readTask: vi.fn(async () => taskContent),
    readLog: vi.fn(async () => logContent),
    writeTask: vi.fn(),
    listTasks: vi.fn(),
    deleteTask: vi.fn(),
    appendLog: vi.fn(),
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
  } as unknown as StorageInterface;
}

describe('createGetTaskTool', () => {
  it('returns task and log combined', async () => {
    const storage = makeStorage('# Task T-001', 'agent | created task');
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const { handler } = createGetTaskTool(taskService, logService);

    const result = await handler({ task_id: 'T-001' });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('# Task T-001');
    expect(text).toContain('agent | created task');
    expect(text).toContain('## Task');
    expect(text).toContain('## Log');
  });

  it('tool definition requires id parameter', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const { definition } = createGetTaskTool(taskService, logService);

    expect(definition.name).toBe('get_task');
    expect(definition.inputSchema.required).toContain('task_id');
  });

  it('propagates error for unknown task id', async () => {
    const storage = makeStorage();
    (storage.readTask as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Task T-999 not found'),
    );
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const { handler } = createGetTaskTool(taskService, logService);

    await expect(handler({ task_id: 'T-999' })).rejects.toThrow();
  });
});
