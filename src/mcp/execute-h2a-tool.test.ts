import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { buildH2AContextBundle } from '../tasks/h2a-actions.js';
import { InvalidH2AActionError } from '../shared/errors.js';
import { createExecuteH2ATool } from './execute-h2a-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(taskMap: Record<string, string> = {}): StorageInterface {
  const logs: Record<string, string[]> = {};
  return {
    listTasks: vi.fn(async () => Object.keys(taskMap)),
    writeTask: vi.fn(async (id: string, content: string) => {
      taskMap[id] = content;
    }),
    readTask: vi.fn(async (id: string) => {
      if (!taskMap[id]) throw new Error(`not found: ${id}`);
      return taskMap[id];
    }),
    deleteTask: vi.fn(async (id: string) => {
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

const h2aContextBundle = buildH2AContextBundle({
  action: 'delete_task',
  targetId: 'T-001',
});

const h2aTask = buildTaskMarkdown({
  id: 'T-H2A',
  title: 'Delete T-001',
  type: 'h2a',
  status: 'executing',
  assignedTo: 'agent-1',
  createdBy: 'cli',
  createdAt: '2024-01-01T00:00:00.000Z',
  contextBundle: h2aContextBundle,
});

const targetTask = buildTaskMarkdown({
  id: 'T-001',
  title: 'Some task',
  type: 'feature',
  status: 'open',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

describe('createExecuteH2ATool', () => {
  it('deletes target task and completes H2A task on valid execution', async () => {
    const taskMap = { 'T-H2A': h2aTask, 'T-001': targetTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService, logService);
    const result = await handler({
      task_id: 'T-H2A',
      client_id: 'agent-1',
      validation_result: 'valid',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.ok).toBe(true);
    expect(data.action).toBe('delete_task');
    expect(data.target_id).toBe('T-001');

    // Target task deleted
    expect(storage.deleteTask).toHaveBeenCalledWith('T-001');

    // H2A task status set to done
    expect(taskMap['T-H2A']).toContain('| status | done');
  });

  it('flags conflict and sets needs_human', async () => {
    const taskMap = { 'T-H2A': h2aTask, 'T-001': targetTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService, logService);
    const result = await handler({
      task_id: 'T-H2A',
      client_id: 'agent-1',
      validation_result: 'conflict',
      conflict_description: 'Task has dependencies',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.ok).toBe(true);
    expect(data.needs_human).toBe(true);

    // H2A task set to open (handleHumanInput clears assigned_to and sets open)
    expect(taskMap['T-H2A']).toContain('| status | open');

    // Target task still exists
    expect(taskMap['T-001']).toBeDefined();
  });

  it('throws InvalidH2AActionError for unparseable payload', async () => {
    const badTask = buildTaskMarkdown({
      id: 'T-BAD',
      title: 'Bad H2A',
      type: 'h2a',
      status: 'executing',
      assignedTo: 'agent-1',
      createdBy: 'cli',
      createdAt: '2024-01-01T00:00:00.000Z',
      contextBundle: 'garbage content',
    });

    const storage = makeStorage({ 'T-BAD': badTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService, logService);
    await expect(
      handler({ task_id: 'T-BAD', client_id: 'agent-1', validation_result: 'valid' }),
    ).rejects.toThrow(InvalidH2AActionError);
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createExecuteH2ATool(taskService, logService);
    expect(definition.name).toBe('execute_h2a');
    expect(definition.inputSchema.required).toContain('task_id');
    expect(definition.inputSchema.required).toContain('client_id');
    expect(definition.inputSchema.required).toContain('validation_result');
  });
});
