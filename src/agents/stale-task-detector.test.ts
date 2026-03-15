/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StaleTaskDetector,
  parseLastLogTimestamp,
  type StaleTaskDetectorDeps,
} from './stale-task-detector.js';
import { AgentNotFoundError } from '../shared/errors.js';

function createMockDeps(overrides?: Partial<StaleTaskDetectorDeps>): StaleTaskDetectorDeps {
  return {
    storage: {
      readTask: vi.fn(),
      writeTask: vi.fn(),
      listTasks: vi.fn().mockResolvedValue([]),
      deleteTask: vi.fn(),
      appendLog: vi.fn(),
      readLog: vi.fn().mockResolvedValue(''),
      readStory: vi.fn(),
      appendStory: vi.fn(),
      readA2A: vi.fn(),
      writeA2A: vi.fn(),
      listA2A: vi.fn().mockResolvedValue([]),
      readActiveAgents: vi.fn(),
      writeActiveAgents: vi.fn(),
    } as unknown as StaleTaskDetectorDeps['storage'],
    taskService: {
      listTasks: vi.fn().mockResolvedValue([]),
      readTask: vi.fn(),
      updateStatus: vi.fn(),
      deleteTask: vi.fn(),
    } as unknown as StaleTaskDetectorDeps['taskService'],
    logService: {
      appendLog: vi.fn().mockResolvedValue(undefined),
      getLog: vi.fn().mockResolvedValue(''),
    } as unknown as StaleTaskDetectorDeps['logService'],
    registry: {
      deregister: vi.fn().mockResolvedValue(undefined),
      isRegistered: vi.fn().mockResolvedValue(true),
    } as unknown as StaleTaskDetectorDeps['registry'],
    ...overrides,
  };
}

const TASK_TEMPLATE = (status: string, assignedTo: string): string =>
  `# Test Task\n\n| Field | Value |\n|-------|-------|\n| id | task-001 |\n| type | feature |\n| status | ${status} |\n| assigned_to | ${assignedTo} |\n`;

const ONE_HOUR_MS = 60 * 60 * 1000;

describe('parseLastLogTimestamp', () => {
  it('should parse a single log line', () => {
    const log = '[2026-03-15 14:30:00] agent-alpha | some message';
    const result = parseLastLogTimestamp(log);
    expect(result).toEqual(new Date('2026-03-15T14:30:00Z'));
  });

  it('should return the last timestamp when multiple lines exist', () => {
    const log = [
      '[2026-03-15 14:00:00] agent-alpha | first',
      '[2026-03-15 14:30:00] agent-alpha | second',
      '[2026-03-15 15:00:00] agent-alpha | third',
    ].join('\n');
    const result = parseLastLogTimestamp(log);
    expect(result).toEqual(new Date('2026-03-15T15:00:00Z'));
  });

  it('should return null for empty string', () => {
    expect(parseLastLogTimestamp('')).toBeNull();
  });

  it('should return null for malformed log content', () => {
    expect(parseLastLogTimestamp('no timestamps here\njust text')).toBeNull();
  });
});

describe('StaleTaskDetector', () => {
  let deps: StaleTaskDetectorDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T16:00:00Z'));
    deps = createMockDeps();
  });

  describe('findStaleTasks()', () => {
    it('should return empty array when no tasks exist', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toEqual([]);
    });

    it('should skip tasks with status done', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('done', 'agent-alpha'),
      );

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toEqual([]);
    });

    it('should skip tasks with status waiting_for_agent', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('waiting_for_agent', 'agent-alpha'),
      );

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toEqual([]);
    });

    it('should skip open (unassigned) tasks', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('open', '—'),
      );

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toEqual([]);
    });

    it('should detect a task with a stale log timestamp', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('executing', 'agent-alpha'),
      );
      // Last log entry is 2 hours ago
      (deps.logService.getLog as ReturnType<typeof vi.fn>).mockResolvedValue(
        '[2026-03-15 14:00:00] agent-alpha | started working',
      );

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        taskId: 'task-001',
        assignedTo: 'agent-alpha',
        lastLogTimestamp: new Date('2026-03-15T14:00:00Z'),
        status: 'executing',
      });
    });

    it('should detect a task with no log entries as stale', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('planning', 'agent-alpha'),
      );
      (deps.logService.getLog as ReturnType<typeof vi.fn>).mockResolvedValue('');

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toHaveLength(1);
      expect(result[0].lastLogTimestamp).toBeNull();
    });

    it('should NOT flag tasks with recent log entries', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('executing', 'agent-alpha'),
      );
      // Last log entry is 30 minutes ago — within the 60min threshold
      (deps.logService.getLog as ReturnType<typeof vi.fn>).mockResolvedValue(
        '[2026-03-15 15:30:00] agent-alpha | still working',
      );

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toEqual([]);
    });

    it('should handle read errors gracefully', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        'task-001',
        'task-002',
      ]);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('file deleted'))
        .mockResolvedValueOnce(TASK_TEMPLATE('executing', 'agent-alpha'));
      (deps.logService.getLog as ReturnType<typeof vi.fn>).mockResolvedValue(
        '[2026-03-15 14:00:00] agent-alpha | started',
      );

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      // Only task-002 should be detected (task-001 errored)
      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task-002');
    });

    it('should detect stale tasks in planning status', async () => {
      (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-001']);
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('planning', 'agent-alpha'),
      );
      (deps.logService.getLog as ReturnType<typeof vi.fn>).mockResolvedValue(
        '[2026-03-15 14:00:00] agent-alpha | claimed task',
      );

      const detector = new StaleTaskDetector(deps);
      const result = await detector.findStaleTasks(ONE_HOUR_MS);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('planning');
    });
  });

  describe('handleStaleTask()', () => {
    const staleTask = {
      taskId: 'task-001',
      assignedTo: 'agent-alpha',
      lastLogTimestamp: new Date('2026-03-15T14:00:00Z'),
      status: 'executing',
    };

    beforeEach(() => {
      (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
        TASK_TEMPLATE('executing', 'agent-alpha'),
      );
    });

    it('should create an A2A agent_silent task', async () => {
      const detector = new StaleTaskDetector(deps);
      const a2aId = await detector.handleStaleTask(staleTask, 'agent-beta');

      expect(a2aId).toBeTruthy();
      expect(deps.storage.writeA2A).toHaveBeenCalledWith(
        a2aId,
        expect.stringContaining('agent_silent'),
      );
    });

    it('should reset task status to open and clear assigned_to', async () => {
      const detector = new StaleTaskDetector(deps);
      await detector.handleStaleTask(staleTask, 'agent-beta');

      expect(deps.storage.writeTask).toHaveBeenCalledWith(
        'task-001',
        expect.stringContaining('| status | open'),
      );
      expect(deps.storage.writeTask).toHaveBeenCalledWith(
        'task-001',
        expect.stringContaining('| assigned_to | —'),
      );
    });

    it('should log the reset', async () => {
      const detector = new StaleTaskDetector(deps);
      const a2aId = await detector.handleStaleTask(staleTask, 'agent-beta');

      expect(deps.logService.appendLog).toHaveBeenCalledWith(
        'task-001',
        'agent-beta',
        expect.stringContaining(`via a2a-${a2aId}`),
      );
    });

    it('should deregister the stale agent', async () => {
      const detector = new StaleTaskDetector(deps);
      await detector.handleStaleTask(staleTask, 'agent-beta');

      expect(deps.registry.deregister).toHaveBeenCalledWith('agent-alpha');
    });

    it('should handle AgentNotFoundError gracefully when deregistering', async () => {
      (deps.registry.deregister as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AgentNotFoundError('agent-alpha'),
      );

      const detector = new StaleTaskDetector(deps);
      // Should not throw
      const a2aId = await detector.handleStaleTask(staleTask, 'agent-beta');
      expect(a2aId).toBeTruthy();
    });

    it('should skip creation if an open agent_silent A2A already exists for the task', async () => {
      (deps.storage.listA2A as ReturnType<typeof vi.fn>).mockResolvedValue(['existing-a2a']);
      (deps.storage.readA2A as ReturnType<typeof vi.fn>).mockResolvedValue(
        '| status | open |\n| target_task | task-001 |',
      );

      const detector = new StaleTaskDetector(deps);
      const a2aId = await detector.handleStaleTask(staleTask, 'agent-beta');

      expect(a2aId).toBe('existing-a2a');
      // Should NOT write a new A2A or reset the task
      expect(deps.storage.writeA2A).not.toHaveBeenCalled();
      expect(deps.storage.writeTask).not.toHaveBeenCalled();
    });
  });
});
