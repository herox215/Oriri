import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { buildH2AContextBundle } from '../tasks/h2a-actions.js';
import { InvalidH2AActionError, StorageReadError } from '../shared/errors.js';
import { createExecuteH2ATool } from './execute-h2a-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(
  regularTasks: Record<string, string> = {},
  humanTasks: Record<string, string> = {},
): StorageInterface {
  const logs: Record<string, string[]> = {};
  const humanLogs: Record<string, string[]> = {};
  return {
    listTasks: vi.fn(async () => Object.keys(regularTasks)),
    writeTask: vi.fn(async (id: string, content: string) => {
      regularTasks[id] = content;
    }),
    readTask: vi.fn(async (id: string) => {
      if (!regularTasks[id]) throw new StorageReadError(`Task ${id}`);
      return regularTasks[id];
    }),
    deleteTask: vi.fn(async (id: string) => {
      delete regularTasks[id];
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
    readHumanTask: vi.fn(async (id: string) => {
      if (!humanTasks[id]) throw new StorageReadError(`H2A ${id}`);
      return humanTasks[id];
    }),
    writeHumanTask: vi.fn(async (id: string, content: string) => {
      humanTasks[id] = content;
    }),
    listHumanTasks: vi.fn(async () => Object.keys(humanTasks)),
    deleteHumanTask: vi.fn(async (id: string) => {
      delete humanTasks[id];
    }),
    appendHumanTaskLog: vi.fn(async (id: string, line: string) => {
      if (!humanLogs[id]) humanLogs[id] = [];
      humanLogs[id].push(line);
    }),
    readHumanTaskLog: vi.fn(async (id: string) => (humanLogs[id] ?? []).join('\n')),
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
    const regularTasks = { 'T-001': targetTask };
    const humanTasks = { 'T-H2A': h2aTask };
    const storage = makeStorage(regularTasks, humanTasks);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService);
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
    expect(humanTasks['T-H2A']).toContain('| status | done');
  });

  it('executes action on confirmed after conflict resolution with human input', async () => {
    // Simulate conflict flagged + human confirmed via TUI
    const h2aTaskWithHumanInput = buildTaskMarkdown({
      id: 'T-H2A',
      title: 'Delete T-001',
      type: 'h2a',
      status: 'executing',
      assignedTo: 'agent-1',
      createdBy: 'cli',
      createdAt: '2024-01-01T00:00:00.000Z',
      contextBundle: h2aContextBundle + '\n\n### Human Input\n\nConfirmed, please delete.',
    });

    const regularTasks = { 'T-001': targetTask };
    const humanTasks = { 'T-H2A': h2aTaskWithHumanInput };
    const storage = makeStorage(regularTasks, humanTasks);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService);
    const result = await handler({
      task_id: 'T-H2A',
      client_id: 'agent-1',
      validation_result: 'confirmed',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.ok).toBe(true);
    expect(data.action).toBe('delete_task');
    expect(data.target_id).toBe('T-001');

    // Target task deleted
    expect(storage.deleteTask).toHaveBeenCalledWith('T-001');

    // H2A task status set to done
    expect(humanTasks['T-H2A']).toContain('| status | done');
  });

  it('throws InvalidH2AActionError on confirmed without prior human input', async () => {
    const storage = makeStorage({ 'T-001': targetTask }, { 'T-H2A': h2aTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService);
    await expect(
      handler({ task_id: 'T-H2A', client_id: 'agent-1', validation_result: 'confirmed' }),
    ).rejects.toThrow(InvalidH2AActionError);

    // Target task NOT deleted
    expect(storage.deleteTask).not.toHaveBeenCalled();
  });

  it('flags conflict and sets needs_human', async () => {
    const regularTasks = { 'T-001': targetTask };
    const humanTasks = { 'T-H2A': h2aTask };
    const storage = makeStorage(regularTasks, humanTasks);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService);
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
    expect(humanTasks['T-H2A']).toContain('| status | open');

    // Target task still exists
    expect(regularTasks['T-001']).toBeDefined();
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

    const storage = makeStorage({}, { 'T-BAD': badTask });
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createExecuteH2ATool(taskService);
    await expect(
      handler({ task_id: 'T-BAD', client_id: 'agent-1', validation_result: 'valid' }),
    ).rejects.toThrow(InvalidH2AActionError);
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage({}, {});
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createExecuteH2ATool(taskService);
    expect(definition.name).toBe('execute_h2a');
    expect(definition.inputSchema.required).toContain('task_id');
    expect(definition.inputSchema.required).toContain('client_id');
    expect(definition.inputSchema.required).toContain('validation_result');
  });
});
