/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadlockDetector, type DeadlockDetectorDeps } from './deadlock-detector.js';

function makeTask(id: string, status: string, deps: string[]): string {
  const depLines = deps.length > 0 ? deps.map((d) => `- ${d}`).join('\n') : 'none';
  return `# Task ${id}\n\n| Field | Value |\n|-------|-------|\n| id | ${id} |\n| status | ${status} |\n| assigned_to | — |\n\n## Dependencies\n\n${depLines}\n`;
}

function createMockDeps(overrides?: Partial<DeadlockDetectorDeps>): DeadlockDetectorDeps {
  return {
    storage: {
      readTask: vi.fn(),
      writeTask: vi.fn().mockResolvedValue(undefined),
      listTasks: vi.fn().mockResolvedValue([]),
      deleteTask: vi.fn(),
      appendLog: vi.fn().mockResolvedValue(undefined),
      readLog: vi.fn().mockResolvedValue(''),
      readStory: vi.fn(),
      appendStory: vi.fn(),
      readA2A: vi.fn(),
      writeA2A: vi.fn().mockResolvedValue(undefined),
      listA2A: vi.fn().mockResolvedValue([]),
      appendA2ALog: vi.fn().mockResolvedValue(undefined),
      readA2ALog: vi.fn().mockResolvedValue(''),
      readActiveAgents: vi.fn(),
      writeActiveAgents: vi.fn(),
    } as unknown as DeadlockDetectorDeps['storage'],
    taskService: {
      listTasks: vi.fn().mockResolvedValue([]),
      readTask: vi.fn(),
    } as unknown as DeadlockDetectorDeps['taskService'],
    logService: {
      appendLog: vi.fn().mockResolvedValue(undefined),
      getLog: vi.fn().mockResolvedValue(''),
    } as unknown as DeadlockDetectorDeps['logService'],
    ...overrides,
  };
}

describe('DeadlockDetector.checkBlockedTasks()', () => {
  let deps: DeadlockDetectorDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('returns empty when no tasks exist', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const detector = new DeadlockDetector(deps);
    const result = await detector.checkBlockedTasks('agent-alpha');
    expect(result).toEqual([]);
  });

  it('sets status to waiting_for_agent when dependency is not done', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      'task-a',
      'task-b',
    ]);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'task-a') return Promise.resolve(makeTask('task-a', 'open', ['task-b']));
      if (id === 'task-b') return Promise.resolve(makeTask('task-b', 'open', []));
      return Promise.reject(new Error('not found'));
    });

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkBlockedTasks('agent-alpha');

    expect(result).toContain('task-a');
    expect(deps.storage.writeTask).toHaveBeenCalledWith(
      'task-a',
      expect.stringContaining('| status | waiting_for_agent'),
    );
    expect(deps.logService.appendLog).toHaveBeenCalledWith(
      'task-a',
      'agent-alpha',
      expect.stringContaining('waiting_for_agent'),
    );
  });

  it('does not update task when dependency is done', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      'task-a',
      'task-b',
    ]);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'task-a') return Promise.resolve(makeTask('task-a', 'open', ['task-b']));
      if (id === 'task-b') return Promise.resolve(makeTask('task-b', 'done', []));
      return Promise.reject(new Error('not found'));
    });

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkBlockedTasks('agent-alpha');

    expect(result).toEqual([]);
    expect(deps.storage.writeTask).not.toHaveBeenCalled();
  });

  it('skips task already in waiting_for_agent status', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      'task-a',
      'task-b',
    ]);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'task-a')
        return Promise.resolve(makeTask('task-a', 'waiting_for_agent', ['task-b']));
      if (id === 'task-b') return Promise.resolve(makeTask('task-b', 'open', []));
      return Promise.reject(new Error('not found'));
    });

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkBlockedTasks('agent-alpha');

    expect(result).toEqual([]);
    expect(deps.storage.writeTask).not.toHaveBeenCalled();
  });

  it('skips done tasks', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue(['task-a']);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTask('task-a', 'done', ['task-b']),
    );

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkBlockedTasks('agent-alpha');

    expect(result).toEqual([]);
  });
});

describe('DeadlockDetector.checkDeadlocks()', () => {
  let deps: DeadlockDetectorDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('returns empty when no tasks exist', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const detector = new DeadlockDetector(deps);
    const result = await detector.checkDeadlocks('agent-alpha');
    expect(result).toEqual([]);
  });

  it('returns empty when no cycles exist', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      'task-a',
      'task-b',
    ]);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'task-a') return Promise.resolve(makeTask('task-a', 'open', ['task-b']));
      if (id === 'task-b') return Promise.resolve(makeTask('task-b', 'open', []));
      return Promise.reject(new Error('not found'));
    });

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkDeadlocks('agent-alpha');

    expect(result).toEqual([]);
    expect(deps.storage.writeA2A).not.toHaveBeenCalled();
  });

  it('creates a deadlock_detected A2A when a cycle is found', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      'task-a',
      'task-b',
    ]);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'task-a') return Promise.resolve(makeTask('task-a', 'open', ['task-b']));
      if (id === 'task-b') return Promise.resolve(makeTask('task-b', 'open', ['task-a']));
      return Promise.reject(new Error('not found'));
    });

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkDeadlocks('agent-alpha');

    expect(result.length).toBeGreaterThan(0);
    expect(deps.storage.writeA2A).toHaveBeenCalledWith(
      result[0],
      expect.stringContaining('deadlock_detected'),
    );
  });

  it('is idempotent — skips creation if open deadlock_detected A2A exists', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      'task-a',
      'task-b',
    ]);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'task-a') return Promise.resolve(makeTask('task-a', 'open', ['task-b']));
      if (id === 'task-b') return Promise.resolve(makeTask('task-b', 'open', ['task-a']));
      return Promise.reject(new Error('not found'));
    });
    (deps.storage.listA2A as ReturnType<typeof vi.fn>).mockResolvedValue(['existing-a2a']);
    (deps.storage.readA2A as ReturnType<typeof vi.fn>).mockResolvedValue(
      '| status | open |\n| type | deadlock_detected |',
    );

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkDeadlocks('agent-alpha');

    expect(result).toEqual([]);
    expect(deps.storage.writeA2A).not.toHaveBeenCalled();
  });

  it('logs deadlock detection on involved tasks', async () => {
    (deps.taskService.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
      'task-a',
      'task-b',
    ]);
    (deps.taskService.readTask as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
      if (id === 'task-a') return Promise.resolve(makeTask('task-a', 'open', ['task-b']));
      if (id === 'task-b') return Promise.resolve(makeTask('task-b', 'open', ['task-a']));
      return Promise.reject(new Error('not found'));
    });

    const detector = new DeadlockDetector(deps);
    const result = await detector.checkDeadlocks('agent-alpha');

    expect(deps.logService.appendLog).toHaveBeenCalledWith(
      expect.stringMatching(/task-[ab]/),
      'agent-alpha',
      expect.stringContaining(`via a2a-${result[0] ?? ''}`),
    );
  });
});
