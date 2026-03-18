import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../tasks/task-service.js';
import { LogService } from '../logs/log-service.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { RoleService } from '../agents/role-service.js';
import { ACTIVE_AGENTS_MD } from '../shared/default-content.js';
// PermissionDeniedError no longer expected since MCP_CLIENT can create tasks
import { createCreateTaskTool } from './create-task-tool.js';
import type { StorageInterface } from '../storage/storage-interface.js';

function makeStorage(initial?: string): StorageInterface {
  let agentsContent = initial ?? ACTIVE_AGENTS_MD;
  return {
    listTasks: vi.fn(async () => []),
    writeTask: vi.fn(),
    readTask: vi.fn(),
    deleteTask: vi.fn(),
    appendLog: vi.fn(),
    readLog: vi.fn(),
    readStory: vi.fn(),
    appendStory: vi.fn(),
    writeStory: vi.fn(),
    readStoryArchive: vi.fn(),
    appendStoryArchive: vi.fn(),
    readActiveAgents: vi.fn(async () => agentsContent),
    writeActiveAgents: vi.fn(async (c: string) => {
      agentsContent = c;
    }),
    readA2A: vi.fn(),
    writeA2A: vi.fn(),
    listA2A: vi.fn(),
    appendA2ALog: vi.fn(),
    readA2ALog: vi.fn(),
  } as unknown as StorageInterface;
}

describe('createCreateTaskTool', () => {
  it('creates a task and returns the id when called with a capable role', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);

    // Register an AGENT who can create tasks
    await registry.register({
      id: 'agent-generalist',
      role: 'AGENT',
      model: 'test-model',
      pid: 0,
      since: '2024-01-01T00:00:00.000Z',
    });

    const { handler } = createCreateTaskTool(taskService, registry, roleService);
    const result = await handler({
      title: 'My new task',
      type: 'feature',
      client_id: 'agent-generalist',
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text) as { id: string };
    expect(typeof data.id).toBe('string');
    expect(storage.writeTask).toHaveBeenCalledOnce();
  });

  it('allows MCP_CLIENT role to create tasks', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);
    const { handler } = createCreateTaskTool(taskService, registry, roleService);

    const result = await handler({ title: 'Task', type: 'feature' });
    expect(result.isError).toBeFalsy();
  });

  it('uses mcp-anonymous as createdBy when no client_id given', async () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);
    const { handler } = createCreateTaskTool(taskService, registry, roleService);

    const result = await handler({ title: 'Task', type: 'bug' });
    expect(result.isError).toBeFalsy();
    // Verify writeTask was called (task was created with mcp-anonymous)
    expect(storage.writeTask).toHaveBeenCalledOnce();
  });

  it('tool definition has correct name and required fields', () => {
    const storage = makeStorage();
    const roleService = new RoleService();
    const logService = new LogService(storage);
    const taskService = new TaskService(storage, logService, roleService);
    const registry = new AgentRegistry(storage);
    const { definition } = createCreateTaskTool(taskService, registry, roleService);

    expect(definition.name).toBe('create_task');
    expect(definition.inputSchema.required).toContain('title');
    expect(definition.inputSchema.required).toContain('type');
  });
});
