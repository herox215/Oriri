import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from './init.js';
import { InitError } from '../shared/errors.js';

describe('initCommand', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should create the directory structure', async () => {
    await initCommand({ force: false, cwd: testDir });

    const base = join(testDir, '.oriri');
    const entries = await readdir(base, { recursive: true });

    expect(entries).toContain('config.yaml');
    expect(entries).toContain('tasks');
  });

  it('should write config.yaml with mode: local', async () => {
    await initCommand({ force: false, cwd: testDir });

    const content = await readFile(join(testDir, '.oriri', 'config.yaml'), 'utf-8');
    expect(content).toContain('mode: local');
  });

  it('should create empty tasks/ directory', async () => {
    await initCommand({ force: false, cwd: testDir });

    const entries = await readdir(join(testDir, '.oriri', 'tasks'));
    expect(entries).toHaveLength(0);
  });

  it('should throw InitError if .oriri/ already exists without --force', async () => {
    await initCommand({ force: false, cwd: testDir });
    await expect(initCommand({ force: false, cwd: testDir })).rejects.toThrow(InitError);
  });

  it('should include --force hint in error message', async () => {
    await initCommand({ force: false, cwd: testDir });
    await expect(initCommand({ force: false, cwd: testDir })).rejects.toThrow('--force');
  });

  it('should overwrite existing files with --force', async () => {
    await initCommand({ force: false, cwd: testDir });

    const configPath = join(testDir, '.oriri', 'config.yaml');
    const { writeFile: write } = await import('node:fs/promises');
    await write(configPath, 'mode: server', 'utf-8');

    await initCommand({ force: true, cwd: testDir });

    const content = await readFile(configPath, 'utf-8');
    expect(content).toContain('mode: local');
  });
});
