import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { TaskNotFoundError } from '../shared/errors.js';
import { TaskService } from './task-service.js';

describe('TaskService', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let service: TaskService;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    service = new TaskService(storage);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createTask', () => {
    it('should create a task and return an 8-hex ID', async () => {
      const id = await service.createTask({ title: 'Fix login bug' });
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should write correct Markdown structure', async () => {
      const id = await service.createTask({ title: 'Add dark mode' });
      const content = await service.readTask(id);
      expect(content).toContain('# Add dark mode');
      expect(content).toContain(`| id | ${id} |`);
      expect(content).toContain('| status | open |');
      expect(content).toContain('| created_at |');
    });

    it('should default to open status', async () => {
      const id = await service.createTask({ title: 'Open task' });
      const content = await service.readTask(id);
      expect(content).toContain('| status | open |');
    });

    it('should include description when provided', async () => {
      const id = await service.createTask({
        title: 'Task with description',
        description: 'Some detailed description',
      });
      const content = await service.readTask(id);
      expect(content).toContain('Some detailed description');
    });
  });

  describe('readTask', () => {
    it('should return task content', async () => {
      const id = await service.createTask({ title: 'Read me' });
      const content = await service.readTask(id);
      expect(content).toContain('# Read me');
    });

    it('should throw TaskNotFoundError for non-existent task', async () => {
      await expect(service.readTask('nonexistent')).rejects.toThrow(TaskNotFoundError);
      await expect(service.readTask('nonexistent')).rejects.toThrow('Task nonexistent not found');
    });
  });

  describe('listTasks', () => {
    it('should return empty array when no tasks exist', async () => {
      const tasks = await service.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should return all task IDs', async () => {
      const id1 = await service.createTask({ title: 'Task 1' });
      const id2 = await service.createTask({ title: 'Task 2' });

      const tasks = await service.listTasks();
      expect(tasks).toContain(id1);
      expect(tasks).toContain(id2);
      expect(tasks).toHaveLength(2);
    });
  });

  describe('deleteTask', () => {
    it('should delete the task file', async () => {
      const id = await service.createTask({ title: 'Delete me' });
      await service.deleteTask(id);
      await expect(service.readTask(id)).rejects.toThrow(TaskNotFoundError);
    });
  });

  describe('completeTask', () => {
    it('should set status to done', async () => {
      const id = await service.createTask({ title: 'Complete me' });
      await service.completeTask(id);
      const content = await service.readTask(id);
      expect(content).toContain('| status | done |');
    });

    it('should throw TaskNotFoundError for non-existent task', async () => {
      await expect(service.completeTask('nonexistent')).rejects.toThrow(TaskNotFoundError);
    });
  });
});
