import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from './init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { AgentNotFoundError } from '../shared/errors.js';
import { agentStopCommand } from './agent-stop.js';

describe('agentStopCommand', () => {
  let testDir: string;
  let registry: AgentRegistry;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    const storage = new FilesystemStorage(join(testDir, '.oriri'));
    registry = new AgentRegistry(storage);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should remove a specific agent', async () => {
    await registry.register({
      id: 'agent-alpha',
      role: 'AGENT',
      model: 'claude-sonnet-4-6',
      pid: 48291,
      since: '2026-03-15',
    });

    await agentStopCommand(registry, { agentId: 'agent-alpha' });

    expect(consoleSpy).toHaveBeenCalledWith('Agent agent-alpha removed from active.md.');
    const agents = await registry.listAgents();
    expect(agents).toEqual([]);
  });

  it('should throw AgentNotFoundError for non-existent agent', async () => {
    await expect(agentStopCommand(registry, { agentId: 'agent-ghost' })).rejects.toThrow(
      AgentNotFoundError,
    );
  });

  it('should clear all agents with --all', async () => {
    await registry.register({
      id: 'agent-alpha',
      role: 'AGENT',
      model: 'claude-sonnet-4-6',
      pid: 48291,
      since: '2026-03-15',
    });

    await agentStopCommand(registry, { all: true });

    expect(consoleSpy).toHaveBeenCalledWith('All agents removed from active.md.');
    const agents = await registry.listAgents();
    expect(agents).toEqual([]);
  });

  it('should print usage error when no option is provided', async () => {
    await agentStopCommand(registry, {});
    expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: oriri agent-stop --agent-id <id> | --all');
    expect(process.exitCode).toBe(1);
  });
});
