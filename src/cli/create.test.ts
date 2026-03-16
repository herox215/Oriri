import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from './init.js';
import { createCommand } from './create.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';

describe('createCommand', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should create a draft task with the given title', async () => {
    await createCommand('Implement user auth', { cwd: testDir });

    const storage = new FilesystemStorage(join(testDir, '.oriri'));
    const ids = await storage.listTasks();
    expect(ids).toHaveLength(1);

    const content = await storage.readTask(ids[0]);
    expect(content).toContain('# Implement user auth');
    expect(content).toContain('| status | draft |');
    expect(content).toContain('| type | chore |');
    expect(content).toContain('| created_by | cli |');
  });

  it('should create multiple drafts with unique IDs', async () => {
    await createCommand('First task', { cwd: testDir });
    await createCommand('Second task', { cwd: testDir });

    const storage = new FilesystemStorage(join(testDir, '.oriri'));
    const ids = await storage.listTasks();
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
