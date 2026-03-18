import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { createAppendLogTool } from './append-log-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(): StorageInterface {
  return {
    appendLog: vi.fn(),
    readLog: vi.fn(),
    readTask: vi.fn().mockResolvedValue('# Task'),
    writeTask: vi.fn(),
    listTasks: vi.fn().mockResolvedValue([]),
    deleteTask: vi.fn(),
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

describe('createAppendLogTool', () => {
  it('appends a log entry with provided client_id', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createAppendLogTool(taskService);

    const result = await handler({ task_id: 'T-001', message: 'did some work', client_id: 'mcp-abc' });

    expect(result.isError).toBeFalsy();
    expect(storage.appendLog).toHaveBeenCalledOnce();
    const [taskId, line] = (storage.appendLog as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(taskId).toBe('T-001');
    expect(line).toContain('mcp-abc');
    expect(line).toContain('did some work');
  });

  it('uses mcp-anonymous when no client_id provided', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createAppendLogTool(taskService);

    await handler({ task_id: 'T-001', message: 'note' });

    const [, line] = (storage.appendLog as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(line).toContain('mcp-anonymous');
  });

  it('tool definition requires id and message', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createAppendLogTool(taskService);

    expect(definition.name).toBe('append_log');
    expect(definition.inputSchema.required).toContain('task_id');
    expect(definition.inputSchema.required).toContain('message');
  });
});
