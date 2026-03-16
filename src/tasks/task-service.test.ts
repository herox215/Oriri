import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { LogService } from '../logs/log-service.js';
import {
  TaskNotFoundError,
  TaskAlreadyClaimedError,
  TaskNotDraftError,
  PermissionDeniedError,
} from '../shared/errors.js';
import { RoleService } from '../agents/role-service.js';
import { TaskService } from './task-service.js';

describe('TaskService', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let logService: LogService;
  let roleService: RoleService;
  let service: TaskService;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    logService = new LogService(storage);
    roleService = new RoleService();
    service = new TaskService(storage, logService, roleService);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createTask', () => {
    it('should create a task and return an 8-hex ID', async () => {
      const id = await service.createTask({
        title: 'Fix login bug',
        type: 'bug',
        createdBy: 'agent-alpha',
      });

      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should write correct Markdown structure', async () => {
      const id = await service.createTask({
        title: 'Add dark mode',
        type: 'feature',
        createdBy: 'agent-alpha',
      });

      const content = await service.readTask(id);
      expect(content).toContain('# Add dark mode');
      expect(content).toContain(`| id | ${id} |`);
      expect(content).toContain('| type | feature |');
      expect(content).toContain('| status | open |');
      expect(content).toContain('| assigned_to | — |');
      expect(content).toContain('| created_by | agent-alpha |');
      expect(content).toContain('| created_at |');
    });

    it('should set auto_human_gate to yes for feature', async () => {
      const id = await service.createTask({
        title: 'New feature',
        type: 'feature',
        createdBy: 'agent-alpha',
      });
      const content = await service.readTask(id);
      expect(content).toContain('| auto_human_gate | yes |');
    });

    it('should set auto_human_gate to yes for bug', async () => {
      const id = await service.createTask({
        title: 'Fix crash',
        type: 'bug',
        createdBy: 'agent-alpha',
      });
      const content = await service.readTask(id);
      expect(content).toContain('| auto_human_gate | yes |');
    });

    it('should set auto_human_gate to no for chore', async () => {
      const id = await service.createTask({
        title: 'Update deps',
        type: 'chore',
        createdBy: 'agent-alpha',
      });
      const content = await service.readTask(id);
      expect(content).toContain('| auto_human_gate | no |');
    });

    it('should set auto_human_gate to no for escalation', async () => {
      const id = await service.createTask({
        title: 'Escalate issue',
        type: 'escalation',
        createdBy: 'agent-alpha',
      });
      const content = await service.readTask(id);
      expect(content).toContain('| auto_human_gate | no |');
    });

    it('should create an initial log entry', async () => {
      const id = await service.createTask({
        title: 'Test task',
        type: 'chore',
        createdBy: 'agent-alpha',
      });
      const log = await storage.readLog(id);
      expect(log).toContain('agent-alpha | created task: Test task');
      expect(log).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
    });

    it('should use custom status when provided', async () => {
      const id = await service.createTask({
        title: 'Draft task',
        type: 'chore',
        createdBy: 'cli',
        status: 'draft',
      });

      const content = await service.readTask(id);
      expect(content).toContain('| status | draft |');
    });

    it('should default to open status when no status provided', async () => {
      const id = await service.createTask({
        title: 'Open task',
        type: 'chore',
        createdBy: 'agent-alpha',
      });

      const content = await service.readTask(id);
      expect(content).toContain('| status | open |');
    });

    it('should include context bundle when provided', async () => {
      const id = await service.createTask({
        title: 'Task with context',
        type: 'feature',
        createdBy: 'agent-alpha',
        contextBundle: 'Related to auth module refactor',
      });
      const content = await service.readTask(id);
      expect(content).toContain('Related to auth module refactor');
    });

    it('should include dependencies when provided', async () => {
      const id = await service.createTask({
        title: 'Dependent task',
        type: 'feature',
        createdBy: 'agent-alpha',
        dependencies: ['abc12345', 'def67890'],
      });
      const content = await service.readTask(id);
      expect(content).toContain('- abc12345');
      expect(content).toContain('- def67890');
    });
  });

  describe('readTask', () => {
    it('should return task content', async () => {
      const id = await service.createTask({
        title: 'Read me',
        type: 'chore',
        createdBy: 'agent-alpha',
      });
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
      const id1 = await service.createTask({
        title: 'Task 1',
        type: 'chore',
        createdBy: 'agent-alpha',
      });
      const id2 = await service.createTask({
        title: 'Task 2',
        type: 'bug',
        createdBy: 'agent-beta',
      });

      const tasks = await service.listTasks();
      expect(tasks).toContain(id1);
      expect(tasks).toContain(id2);
      expect(tasks).toHaveLength(2);
    });
  });

  describe('deleteTask', () => {
    it('should delete the task file', async () => {
      const id = await service.createTask({
        title: 'Delete me',
        type: 'chore',
        createdBy: 'agent-alpha',
      });
      await service.deleteTask(id);
      await expect(service.readTask(id)).rejects.toThrow(TaskNotFoundError);
    });

    it('should preserve the log file after deletion', async () => {
      const id = await service.createTask({
        title: 'Log survives',
        type: 'chore',
        createdBy: 'agent-alpha',
      });
      await service.deleteTask(id);
      const log = await storage.readLog(id);
      expect(log).toContain('created task: Log survives');
    });
  });

  describe('updateStatus', () => {
    it('should update the status in the Markdown', async () => {
      const id = await service.createTask({
        title: 'Status task',
        type: 'feature',
        createdBy: 'agent-alpha',
      });

      await service.updateStatus(id, 'planning', 'agent-alpha');
      const content = await service.readTask(id);
      expect(content).toContain('| status | planning |');
    });

    it('should create a log entry for the status transition', async () => {
      const id = await service.createTask({
        title: 'Log transition',
        type: 'feature',
        createdBy: 'agent-alpha',
      });

      await service.updateStatus(id, 'planning', 'agent-alpha');
      const log = await storage.readLog(id);
      expect(log).toContain('agent-alpha | status: open → planning');
    });

    it('should support multiple status transitions', async () => {
      const id = await service.createTask({
        title: 'Multi transition',
        type: 'chore',
        createdBy: 'agent-alpha',
      });

      await service.updateStatus(id, 'planning', 'agent-alpha');
      await service.updateStatus(id, 'executing', 'agent-alpha');
      await service.updateStatus(id, 'done', 'agent-alpha');

      const content = await service.readTask(id);
      expect(content).toContain('| status | done |');

      const log = await storage.readLog(id);
      expect(log).toContain('status: open → planning');
      expect(log).toContain('status: planning → executing');
      expect(log).toContain('status: executing → done');
    });

    it('should throw TaskNotFoundError for non-existent task', async () => {
      await expect(service.updateStatus('nonexistent', 'planning', 'agent-alpha')).rejects.toThrow(
        TaskNotFoundError,
      );
    });
  });

  describe('claimTask', () => {
    it('should set status to planning and assigned_to to agent ID', async () => {
      const id = await service.createTask({
        title: 'Claimable task',
        type: 'feature',
        createdBy: 'agent-alpha',
      });

      await service.claimTask(id, 'agent-beta', 'CODER');
      const content = await service.readTask(id);
      expect(content).toContain('| status | planning |');
      expect(content).toContain('| assigned_to | agent-beta |');
    });

    it('should create a log entry on successful claim', async () => {
      const id = await service.createTask({
        title: 'Log claim',
        type: 'bug',
        createdBy: 'agent-alpha',
      });

      await service.claimTask(id, 'agent-beta', 'CODER');
      const log = await storage.readLog(id);
      expect(log).toContain('agent-beta | claimed task, status: open → planning');
    });

    it('should throw TaskAlreadyClaimedError when task is already claimed', async () => {
      const id = await service.createTask({
        title: 'Already claimed',
        type: 'chore',
        createdBy: 'agent-alpha',
      });

      await service.claimTask(id, 'agent-beta', 'CODER');
      await expect(service.claimTask(id, 'agent-gamma', 'CODER')).rejects.toThrow(
        TaskAlreadyClaimedError,
      );
    });

    it('should throw PermissionDeniedError for OBSERVER role', async () => {
      const id = await service.createTask({
        title: 'Observer cannot claim',
        type: 'chore',
        createdBy: 'agent-alpha',
      });

      await expect(service.claimTask(id, 'agent-observer', 'OBSERVER')).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it('should throw PermissionDeniedError when CODER tries to claim escalation', async () => {
      const id = await service.createTask({
        title: 'Escalation task',
        type: 'escalation',
        createdBy: 'agent-alpha',
      });

      await expect(service.claimTask(id, 'agent-coder', 'CODER')).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it('should throw PermissionDeniedError when REVIEWER tries to claim open task', async () => {
      const id = await service.createTask({
        title: 'Open task',
        type: 'feature',
        createdBy: 'agent-alpha',
      });

      await expect(service.claimTask(id, 'agent-reviewer', 'REVIEWER')).rejects.toThrow(
        PermissionDeniedError,
      );
    });

    it('should throw TaskNotFoundError for non-existent task', async () => {
      await expect(service.claimTask('nonexistent', 'agent-alpha', 'CODER')).rejects.toThrow(
        TaskNotFoundError,
      );
    });
  });

  describe('refineTask', () => {
    it('should promote a draft task to open status', async () => {
      const id = await service.createTask({
        title: 'Draft idea',
        type: 'chore',
        createdBy: 'cli',
        status: 'draft',
      });

      await service.refineTask(id, 'agent-alpha');
      const content = await service.readTask(id);
      expect(content).toContain('| status | open |');
    });

    it('should throw TaskNotDraftError when task is not a draft', async () => {
      const id = await service.createTask({
        title: 'Open task',
        type: 'chore',
        createdBy: 'agent-alpha',
      });

      await expect(service.refineTask(id, 'agent-alpha')).rejects.toThrow(TaskNotDraftError);
    });

    it('should update the task type when provided', async () => {
      const id = await service.createTask({
        title: 'Needs type change',
        type: 'chore',
        createdBy: 'cli',
        status: 'draft',
      });

      await service.refineTask(id, 'agent-alpha', { type: 'feature' });
      const content = await service.readTask(id);
      expect(content).toContain('| type | feature |');
      expect(content).toContain('| status | open |');
    });

    it('should update the context bundle when provided', async () => {
      const id = await service.createTask({
        title: 'Needs context',
        type: 'chore',
        createdBy: 'cli',
        status: 'draft',
      });

      await service.refineTask(id, 'agent-alpha', { contextBundle: 'Refined context here' });
      const content = await service.readTask(id);
      expect(content).toContain('Refined context here');
    });

    it('should create a log entry for the refinement', async () => {
      const id = await service.createTask({
        title: 'Log refinement',
        type: 'chore',
        createdBy: 'cli',
        status: 'draft',
      });

      await service.refineTask(id, 'agent-alpha');
      const log = await storage.readLog(id);
      expect(log).toContain('agent-alpha | refined task: draft → open');
    });

    it('should throw TaskNotFoundError for non-existent task', async () => {
      await expect(service.refineTask('nonexistent', 'agent-alpha')).rejects.toThrow(
        TaskNotFoundError,
      );
    });
  });
});
