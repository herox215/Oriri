import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { A2ANotFoundError } from '../shared/errors.js';
import { A2AService } from './a2a-service.js';

describe('A2AService', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let service: A2AService;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-a2a-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    service = new A2AService(storage);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createA2A', () => {
    it('should create an A2A task and return an 8-hex ID', async () => {
      const id = await service.createA2A({
        type: 'agent_silent',
        createdBy: 'agent-beta',
        description: 'Agent alpha has gone silent.',
      });

      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should write correct markdown with all fields', async () => {
      const id = await service.createA2A({
        type: 'agent_silent',
        createdBy: 'agent-beta',
        targetTaskId: 'abc12345',
        targetAgentId: 'agent-alpha',
        description: 'Agent alpha has gone silent.',
      });

      const content = await service.readA2A(id);
      expect(content).toContain('# A2A: agent_silent');
      expect(content).toContain(`| id | ${id} |`);
      expect(content).toContain('| type | agent_silent |');
      expect(content).toContain('| status | open |');
      expect(content).toContain('| created_by | agent-beta |');
      expect(content).toContain('| target_task | abc12345 |');
      expect(content).toContain('| target_agent | agent-alpha |');
      expect(content).toContain('Agent alpha has gone silent.');
    });

    it('should write a log entry on creation', async () => {
      const id = await service.createA2A({
        type: 'story_archive',
        createdBy: 'agent-alpha',
        description: 'story.md exceeded 200 lines.',
      });

      const log = await service.readA2ALog(id);
      expect(log).toContain('agent-alpha');
      expect(log).toContain('created A2A task: story_archive');
    });
  });

  describe('readA2A', () => {
    it('should throw A2ANotFoundError for missing task', async () => {
      await expect(service.readA2A('nonexist')).rejects.toThrow(A2ANotFoundError);
    });
  });

  describe('listA2A', () => {
    it('should return empty list when no A2A tasks exist', async () => {
      const ids = await service.listA2A();
      expect(ids).toEqual([]);
    });

    it('should return IDs of all created A2A tasks', async () => {
      const id1 = await service.createA2A({
        type: 'agent_silent',
        createdBy: 'agent-beta',
        description: 'First.',
      });
      const id2 = await service.createA2A({
        type: 'story_archive',
        createdBy: 'agent-beta',
        description: 'Second.',
      });

      const ids = await service.listA2A();
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });
  });

  describe('resolveA2A', () => {
    it('should update status to resolved', async () => {
      const id = await service.createA2A({
        type: 'merge_proposal',
        createdBy: 'agent-alpha',
        description: 'Merge tasks A and B.',
      });

      await service.resolveA2A(id, 'agent-beta');

      const content = await service.readA2A(id);
      expect(content).toContain('| status | resolved |');
    });

    it('should append a log entry on resolution', async () => {
      const id = await service.createA2A({
        type: 'merge_proposal',
        createdBy: 'agent-alpha',
        description: 'Merge tasks A and B.',
      });

      await service.resolveA2A(id, 'agent-beta');

      const log = await service.readA2ALog(id);
      expect(log).toContain('agent-beta');
      expect(log).toContain('resolved');
    });

    it('should append reference to target task log when targetTaskId is set', async () => {
      // Create a real task first so the log append doesn't fail
      const { TaskService } = await import('../tasks/task-service.js');
      const { LogService } = await import('../logs/log-service.js');
      const { RoleService } = await import('../agents/role-service.js');
      const logService = new LogService(storage);
      const roleService = new RoleService();
      const taskService = new TaskService(storage, logService, roleService);

      const taskId = await taskService.createTask({
        title: 'Some task',
        type: 'chore',
        createdBy: 'agent-alpha',
      });

      const a2aId = await service.createA2A({
        type: 'agent_silent',
        createdBy: 'agent-beta',
        targetTaskId: taskId,
        description: 'Agent alpha is silent.',
      });

      await service.resolveA2A(a2aId, 'agent-beta');

      const taskLog = await storage.readLog(taskId);
      expect(taskLog).toContain(`via a2a-${a2aId} ✓`);
    });

    it('should throw A2ANotFoundError when resolving missing task', async () => {
      await expect(service.resolveA2A('nonexist', 'agent-alpha')).rejects.toThrow(A2ANotFoundError);
    });
  });
});
