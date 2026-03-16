import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
import { buildTaskMarkdown } from '../tasks/task-markdown.js';
import { createRequestHumanGateTool } from './request-human-gate-tool.js';
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
    readActiveAgents: vi.fn(async () => ACTIVE_AGENTS_MD),
    writeActiveAgents: vi.fn(),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

const openTask = buildTaskMarkdown({
  id: 'T-001',
  title: 'Task needing review',
  type: 'feature',
  status: 'executing',
  assignedTo: 'client-abc',
  createdBy: 'test',
  createdAt: '2024-01-01T00:00:00.000Z',
});

describe('createRequestHumanGateTool', () => {
  it('sets status to needs_human and logs the reason', async () => {
    const taskMap = { 'T-001': openTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createRequestHumanGateTool(taskService, logService);
    const result = await handler({
      id: 'T-001',
      reason: 'Need approval before proceeding',
      client_id: 'client-abc',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as { ok: boolean };
    expect(data.ok).toBe(true);

    // status updated to needs_human
    expect(taskMap['T-001']).toContain('| status | needs_human');

    // reason logged
    expect(storage.appendLog).toHaveBeenCalledWith(
      'T-001',
      expect.stringContaining('human gate requested: Need approval before proceeding'),
    );
  });

  it('works without client_id', async () => {
    const taskMap = { 'T-001': openTask };
    const storage = makeStorage(taskMap);
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { handler } = createRequestHumanGateTool(taskService, logService);
    const result = await handler({ id: 'T-001', reason: 'something unclear' });

    expect(result.isError).toBeFalsy();
    expect(taskMap['T-001']).toContain('| status | needs_human');
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);

    const { definition } = createRequestHumanGateTool(taskService, logService);
    expect(definition.name).toBe('request_human_gate');
    expect(definition.inputSchema.required).toContain('id');
    expect(definition.inputSchema.required).toContain('reason');
  });
});
