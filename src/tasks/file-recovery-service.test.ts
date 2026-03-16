import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileRecoveryService } from './file-recovery-service.js';
import { StorageReadError } from '../shared/errors.js';

function makeStorage(overrides?: Record<string, unknown>) {
  return {
    readTask: vi.fn().mockRejectedValue(new StorageReadError('task')),
    writeTask: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
    deleteTask: vi.fn(),
    appendLog: vi.fn().mockResolvedValue(undefined),
    readLog: vi.fn().mockResolvedValue(''),
    readStory: vi.fn().mockResolvedValue(''),
    appendStory: vi.fn(),
    readA2A: vi.fn(),
    writeA2A: vi.fn().mockResolvedValue(undefined),
    listA2A: vi.fn().mockResolvedValue([]),
    appendA2ALog: vi.fn().mockResolvedValue(undefined),
    readActiveAgents: vi.fn(),
    writeActiveAgents: vi.fn(),
    ...overrides,
  };
}

function makeLogService(log = '') {
  return {
    appendLog: vi.fn().mockResolvedValue(undefined),
    getLog: vi.fn().mockResolvedValue(log),
  };
}

function makeA2AService(a2aId = 'a2a-001') {
  return {
    createA2A: vi.fn().mockResolvedValue(a2aId),
  };
}

function makeStoryService(story = '') {
  return {
    getStory: vi.fn().mockResolvedValue(story),
  };
}

function makeService(
  overrides?: Record<string, unknown>,
  log = '',
  story = '',
  a2aId = 'a2a-001',
) {
  const storage = makeStorage(overrides);
  const logService = makeLogService(log);
  const a2aService = makeA2AService(a2aId);
  const storyService = makeStoryService(story);
  const service = new FileRecoveryService(
    storage as never,
    logService as never,
    a2aService as never,
    storyService as never,
  );
  return { service, storage, logService, a2aService, storyService };
}

describe('FileRecoveryService.parseLogForReconstruction', () => {
  let service: FileRecoveryService;

  beforeEach(() => {
    ({ service } = makeService());
  });

  it('returns null for empty log', () => {
    expect(service.parseLogForReconstruction('task-abc', '')).toBeNull();
  });

  it('extracts title, createdBy, and createdAt from creation line', () => {
    const log = '[2026-03-16 10:00:00] agent-x | created task: Fix the bug';
    const result = service.parseLogForReconstruction('task-abc', log);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Fix the bug');
    expect(result!.createdBy).toBe('agent-x');
    expect(result!.createdAt).toBe('2026-03-16T10:00:00:00.000Z');
  });

  it('extracts last known status', () => {
    const log = [
      '[2026-03-16 10:00:00] agent-x | created task: My Task',
      '[2026-03-16 10:05:00] agent-x | status: open → planning',
      '[2026-03-16 10:10:00] agent-x | status: planning → executing',
    ].join('\n');
    const result = service.parseLogForReconstruction('task-abc', log);
    expect(result!.status).toBe('executing');
  });

  it('extracts assignedTo from claim line', () => {
    const log = [
      '[2026-03-16 10:00:00] agent-x | created task: My Task',
      '[2026-03-16 10:05:00] agent-y | claimed task, status: open → planning',
    ].join('\n');
    const result = service.parseLogForReconstruction('task-abc', log);
    expect(result!.assignedTo).toBe('agent-y');
  });

  it('returns null when no creation line found', () => {
    const log = '[2026-03-16 10:05:00] agent-y | status: open → planning';
    expect(service.parseLogForReconstruction('task-abc', log)).toBeNull();
  });
});

describe('FileRecoveryService.searchStoryForTask', () => {
  let service: FileRecoveryService;

  beforeEach(() => {
    ({ service } = makeService());
  });

  it('returns empty array when taskId not found in story', () => {
    const story =
      '[2026-03-16 10:00:00] agent-x | completed task-other\n[2026-03-16 10:01:00] agent-y | reviewed PR';
    expect(service.searchStoryForTask('task-abc', story)).toHaveLength(0);
  });

  it('returns matching lines when taskId found', () => {
    const story = [
      '[2026-03-16 10:00:00] agent-x | started working on task-abc',
      '[2026-03-16 10:05:00] agent-y | reviewed task-other',
      '[2026-03-16 10:10:00] agent-z | completed task-abc successfully',
    ].join('\n');
    const result = service.searchStoryForTask('task-abc', story);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('task-abc');
    expect(result[1]).toContain('task-abc');
  });
});

describe('FileRecoveryService.recoverTask', () => {
  it('returns early when task already exists', async () => {
    const { service, storage } = makeService({
      readTask: vi.fn().mockResolvedValue('# existing task'),
    });
    const result = await service.recoverTask('task-abc', 'agent-x');
    expect(result.success).toBe(true);
    expect(result.message).toContain('already exists');
    expect(storage.writeTask).not.toHaveBeenCalled();
  });

  it('recovers from agent memory when provided', async () => {
    const { service, storage, logService } = makeService();
    const memory = '# My Task\n\n| Field | Value |\n|-------|-------|\n| id | task-abc |';
    const result = await service.recoverTask('task-abc', 'agent-x', memory);

    expect(result.success).toBe(true);
    expect(result.source).toBe('agent_memory');
    expect(result.reconstructedMarkdown).toBe(memory);
    expect(storage.writeTask).toHaveBeenCalledWith('task-abc', memory);
    expect(logService.appendLog).toHaveBeenCalledWith(
      'task-abc',
      'agent-x',
      expect.stringContaining('[RECOVERY]'),
    );
  });

  it('recovers from log file when title found in log', async () => {
    const log = '[2026-03-16 10:00:00] agent-x | created task: My Lost Task';
    const { service, storage } = makeService({}, log);
    const result = await service.recoverTask('task-abc', 'agent-x');

    expect(result.success).toBe(true);
    expect(result.source).toBe('log');
    expect(result.reconstructedMarkdown).toContain('My Lost Task');
    expect(storage.writeTask).toHaveBeenCalledWith('task-abc', expect.stringContaining('My Lost Task'));
  });

  it('creates file_missing A2A with story context when log is empty but story has mentions', async () => {
    const story = '[2026-03-16 10:00:00] agent-x | worked on task-abc yesterday';
    const { service, a2aService } = makeService({}, '', story);
    const result = await service.recoverTask('task-abc', 'agent-x');

    expect(result.success).toBe(false);
    expect(result.source).toBe('story');
    expect(result.a2aId).toBe('a2a-001');
    expect(a2aService.createA2A).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'file_missing', targetTaskId: 'task-abc' }),
    );
    expect(result.message).toContain('story.md');
  });

  it('creates file_missing A2A with no-context message when nothing available', async () => {
    const { service, a2aService } = makeService();
    const result = await service.recoverTask('task-abc', 'agent-x');

    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
    expect(result.a2aId).toBe('a2a-001');
    expect(a2aService.createA2A).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'file_missing',
        targetTaskId: 'task-abc',
        description: expect.stringContaining('Human must recreate'),
      }),
    );
  });

  it('falls through to none when log has no title and story is empty', async () => {
    const log = '[2026-03-16 10:05:00] agent-y | status: open → planning';
    const { service, a2aService } = makeService({}, log, '');
    const result = await service.recoverTask('task-abc', 'agent-x');

    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
    expect(a2aService.createA2A).toHaveBeenCalledOnce();
  });
});
