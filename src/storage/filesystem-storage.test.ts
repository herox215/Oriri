import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { OririError, StorageReadError } from '../shared/errors.js';
import { FilesystemStorage, createStorageAdapter } from './filesystem-storage.js';

describe('FilesystemStorage', () => {
  let testDir: string;
  let basePath: string;
  let storage: FilesystemStorage;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    basePath = join(testDir, '.oriri');
    storage = new FilesystemStorage(basePath);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // Tasks

  describe('readTask / writeTask', () => {
    it('should roundtrip task content', async () => {
      const content = '# Task\n\nSome task content';
      await storage.writeTask('abc123', content);
      const result = await storage.readTask('abc123');
      expect(result).toBe(content);
    });

    it('should throw StorageReadError for non-existent task', async () => {
      await expect(storage.readTask('nonexistent')).rejects.toThrow(StorageReadError);
      await expect(storage.readTask('nonexistent')).rejects.toThrow('Task nonexistent not found');
    });

    it('should overwrite existing task', async () => {
      await storage.writeTask('abc123', 'v1');
      await storage.writeTask('abc123', 'v2');
      const result = await storage.readTask('abc123');
      expect(result).toBe('v2');
    });
  });

  describe('listTasks', () => {
    it('should return empty array for empty tasks dir', async () => {
      const tasks = await storage.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should return task IDs without prefix and suffix', async () => {
      await storage.writeTask('aaa', 'content a');
      await storage.writeTask('bbb', 'content b');
      const tasks = await storage.listTasks();
      expect(tasks).toContain('aaa');
      expect(tasks).toContain('bbb');
      expect(tasks).toHaveLength(2);
    });

    it('should not include log files', async () => {
      await storage.writeTask('abc123', 'task content');
      await storage.appendLog('abc123', 'log line');
      const tasks = await storage.listTasks();
      expect(tasks).toEqual(['abc123']);
    });
  });

  describe('deleteTask', () => {
    it('should remove the task file', async () => {
      await storage.writeTask('abc123', 'content');
      await storage.deleteTask('abc123');
      await expect(storage.readTask('abc123')).rejects.toThrow(StorageReadError);
    });

    it('should not throw for non-existent task', async () => {
      await expect(storage.deleteTask('nonexistent')).resolves.toBeUndefined();
    });

    it('should not remove the log file', async () => {
      await storage.writeTask('abc123', 'content');
      await storage.appendLog('abc123', 'log entry');
      await storage.deleteTask('abc123');
      const log = await storage.readLog('abc123');
      expect(log).toContain('log entry');
    });
  });

  // Logs

  describe('appendLog / readLog', () => {
    it('should create log file on first append', async () => {
      await storage.appendLog('task1', 'first line');
      const log = await storage.readLog('task1');
      expect(log).toBe('first line\n');
    });

    it('should append multiple lines', async () => {
      await storage.appendLog('task1', 'line 1');
      await storage.appendLog('task1', 'line 2');
      const log = await storage.readLog('task1');
      expect(log).toBe('line 1\nline 2\n');
    });

    it('should return empty string for non-existent log', async () => {
      const log = await storage.readLog('nonexistent');
      expect(log).toBe('');
    });
  });

  // Story

  describe('readStory / appendStory', () => {
    it('should read initial story content from init', async () => {
      const story = await storage.readStory();
      expect(story).toMatch(/^# Story/);
    });

    it('should append a line to story', async () => {
      await storage.appendStory('[2026-03-15] agent-alpha | Started work');
      const story = await storage.readStory();
      expect(story).toContain('[2026-03-15] agent-alpha | Started work');
    });

    it('should accumulate multiple appends', async () => {
      await storage.appendStory('line 1');
      await storage.appendStory('line 2');
      const story = await storage.readStory();
      expect(story).toContain('line 1');
      expect(story).toContain('line 2');
    });

    it('should throw StorageReadError if story.md is missing', async () => {
      const emptyStorage = new FilesystemStorage(join(testDir, 'nonexistent'));
      await expect(emptyStorage.readStory()).rejects.toThrow(StorageReadError);
    });
  });

  // A2A

  describe('readA2A / writeA2A', () => {
    it('should roundtrip A2A content', async () => {
      const content = '# A2A Task\n\nMerge proposal';
      await storage.writeA2A('xyz789', content);
      const result = await storage.readA2A('xyz789');
      expect(result).toBe(content);
    });

    it('should throw StorageReadError for non-existent A2A', async () => {
      await expect(storage.readA2A('nonexistent')).rejects.toThrow(StorageReadError);
      await expect(storage.readA2A('nonexistent')).rejects.toThrow('A2A nonexistent not found');
    });
  });

  describe('listA2A', () => {
    it('should return empty array for empty agent-tasks dir', async () => {
      const a2as = await storage.listA2A();
      expect(a2as).toEqual([]);
    });

    it('should return A2A IDs', async () => {
      await storage.writeA2A('id1', 'content 1');
      await storage.writeA2A('id2', 'content 2');
      const a2as = await storage.listA2A();
      expect(a2as).toContain('id1');
      expect(a2as).toContain('id2');
      expect(a2as).toHaveLength(2);
    });
  });

  // Agents

  describe('readActiveAgents / writeActiveAgents', () => {
    it('should read initial active agents content from init', async () => {
      const content = await storage.readActiveAgents();
      expect(content).toContain('# Active Agents');
    });

    it('should overwrite active agents content', async () => {
      const newContent = '# Active Agents\n\n| agent-alpha | CODER |';
      await storage.writeActiveAgents(newContent);
      const result = await storage.readActiveAgents();
      expect(result).toBe(newContent);
    });
  });
});

describe('createStorageAdapter', () => {
  it('should return FilesystemStorage for mode "local"', () => {
    const adapter = createStorageAdapter('local', '/tmp/test');
    expect(adapter).toBeInstanceOf(FilesystemStorage);
  });

  it('should throw OririError for unknown mode', () => {
    expect(() => createStorageAdapter('unknown', '/tmp/test')).toThrow(OririError);
    expect(() => createStorageAdapter('unknown', '/tmp/test')).toThrow(
      'Unknown storage mode: unknown',
    );
  });
});
