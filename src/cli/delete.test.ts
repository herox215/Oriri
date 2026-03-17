import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deleteCommand } from './delete.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { LogService } from '../logs/log-service.js';
import { RoleService } from '../agents/role-service.js';
import { TaskService } from '../tasks/task-service.js';
import { TaskNotFoundError } from '../shared/errors.js';

let tempDir: string;
let basePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'oriri-delete-test-'));
  basePath = join(tempDir, '.oriri');
  await mkdir(join(basePath, 'tasks'), { recursive: true });
  await writeFile(
    join(basePath, 'config.yaml'),
    'mode: local\nproviders:\n  - name: test\n    type: anthropic\n    model: test\n',
  );
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('deleteCommand', () => {
  it('creates an H2A task for an existing target', async () => {
    // Create a target task first
    const storage = new FilesystemStorage(basePath);
    const logService = new LogService(storage);
    const roleService = new RoleService();
    const taskService = new TaskService(storage, logService, roleService);

    const targetId = await taskService.createTask({
      title: 'Target task',
      type: 'feature',
      createdBy: 'test',
      status: 'open',
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await deleteCommand(targetId, { cwd: tempDir });
    consoleSpy.mockRestore();

    // Should have created a second task (the H2A task)
    const tasks = await storage.listTasks();
    expect(tasks.length).toBe(2);

    // Find the H2A task
    const h2aId = tasks.find((id) => id !== targetId);
    expect(h2aId).toBeDefined();
    const h2aMarkdown = await storage.readTask(h2aId as string);
    expect(h2aMarkdown).toContain('| type | h2a');
    expect(h2aMarkdown).toContain('| status | open');
    expect(h2aMarkdown).toContain('delete_task');
    expect(h2aMarkdown).toContain(targetId);
  });

  it('throws TaskNotFoundError when target does not exist', async () => {
    await expect(deleteCommand('T-NONEXISTENT', { cwd: tempDir })).rejects.toThrow(
      TaskNotFoundError,
    );
  });
});
