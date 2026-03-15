import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { LogService } from './log-service.js';

describe('LogService', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let logService: LogService;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    logService = new LogService(storage);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('appendLog', () => {
    it('should append a formatted line with automatic timestamp', async () => {
      await logService.appendLog('abc12345', 'agent-alpha', 'started work');

      const log = await logService.getLog('abc12345');
      expect(log).toMatch(
        /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] agent-alpha \| started work\n$/,
      );
    });

    it('should append multiple lines without overwriting', async () => {
      await logService.appendLog('abc12345', 'agent-alpha', 'first entry');
      await logService.appendLog('abc12345', 'agent-beta', 'second entry');

      const log = await logService.getLog('abc12345');
      const lines = log.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('agent-alpha | first entry');
      expect(lines[1]).toContain('agent-beta | second entry');
    });

    it('should format timestamp as [YYYY-MM-DD HH:MM:SS]', async () => {
      await logService.appendLog('abc12345', 'agent-alpha', 'test');

      const log = await logService.getLog('abc12345');
      const match = log.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
      expect(match).not.toBeNull();
      expect(match).toHaveLength(2);

      // Verify the timestamp is parseable
      const timestamp = (match as RegExpMatchArray)[1];
      const parsed = new Date(timestamp.replace(' ', 'T'));
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  describe('getLog', () => {
    it('should return all log entries', async () => {
      await logService.appendLog('abc12345', 'agent-alpha', 'entry one');
      await logService.appendLog('abc12345', 'agent-alpha', 'entry two');
      await logService.appendLog('abc12345', 'agent-alpha', 'entry three');

      const log = await logService.getLog('abc12345');
      expect(log).toContain('entry one');
      expect(log).toContain('entry two');
      expect(log).toContain('entry three');
    });

    it('should return empty string for non-existent log', async () => {
      const log = await logService.getLog('nonexistent');
      expect(log).toBe('');
    });
  });

  describe('log independence', () => {
    it('should survive task deletion', async () => {
      const taskId = 'abc12345';
      await storage.writeTask(taskId, '# Test task');
      await logService.appendLog(taskId, 'agent-alpha', 'task created');

      await storage.deleteTask(taskId);

      const log = await logService.getLog(taskId);
      expect(log).toContain('agent-alpha | task created');
    });

    it('should exist independently without a task file', async () => {
      await logService.appendLog('no-task', 'agent-alpha', 'orphan log');

      const log = await logService.getLog('no-task');
      expect(log).toContain('agent-alpha | orphan log');
    });
  });
});
