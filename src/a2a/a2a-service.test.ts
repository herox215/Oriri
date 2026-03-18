import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { A2ANotFoundError, A2ALimitExceededError } from '../shared/errors.js';
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

    it('should write voters and deadline to markdown when provided', async () => {
      const id = await service.createA2A({
        type: 'rules_change',
        createdBy: 'agent-alpha',
        description: 'Change voting threshold.',
        voters: [
          { id: 'agent-alpha', model: 'claude-3-5-sonnet' },
          { id: 'agent-human', model: 'human' },
        ],
        deadline: '2026-03-17T10:00:00.000Z',
      });

      const content = await service.readA2A(id);
      expect(content).toContain('| voters | agent-alpha:claude-3-5-sonnet,agent-human:human |');
      expect(content).toContain('| deadline | 2026-03-17T10:00:00.000Z |');
    });

    it('should default deadline to 24h from createdAt when voters provided without deadline', async () => {
      const id = await service.createA2A({
        type: 'rules_change',
        createdBy: 'agent-alpha',
        description: 'Change voting threshold.',
        voters: [{ id: 'agent-alpha', model: 'claude-3-5-sonnet' }],
      });

      const content = await service.readA2A(id);
      expect(content).toContain('| deadline |');
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

  describe('A2A limit per target task', () => {
    it('should throw A2ALimitExceededError when 3 open A2As exist for same target', async () => {
      const targetTaskId = 'task-target';
      for (let i = 0; i < 3; i++) {
        await service.createA2A({
          type: 'split_proposal',
          createdBy: 'agent-alpha',
          description: `Proposal ${String(i + 1)}`,
          targetTaskId,
        });
      }

      await expect(
        service.createA2A({
          type: 'dependency_discovery',
          createdBy: 'agent-alpha',
          description: 'Proposal 4',
          targetTaskId,
        }),
      ).rejects.toThrow(A2ALimitExceededError);
    });

    it('should allow 4th A2A after resolving one', async () => {
      const targetTaskId = 'task-target2';
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const id = await service.createA2A({
          type: 'split_proposal',
          createdBy: 'agent-alpha',
          description: `Proposal ${String(i + 1)}`,
          targetTaskId,
        });
        ids.push(id);
      }

      // Resolve one
      await service.resolveA2A(ids[0], 'agent-alpha');

      // Now the 4th should succeed
      const id4 = await service.createA2A({
        type: 'dependency_discovery',
        createdBy: 'agent-alpha',
        description: 'Proposal 4',
        targetTaskId,
      });
      expect(id4).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should allow unlimited A2As without target task', async () => {
      for (let i = 0; i < 5; i++) {
        const id = await service.createA2A({
          type: 'story_archive',
          createdBy: 'agent-alpha',
          description: `Archive ${String(i + 1)}`,
        });
        expect(id).toMatch(/^[0-9a-f]{8}$/);
      }
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
