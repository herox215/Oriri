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
