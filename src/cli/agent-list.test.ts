import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from './init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { AgentRegistry } from '../agents/agent-registry.js';
import { agentListCommand } from './agent-list.js';

describe('agentListCommand', () => {
  let testDir: string;
  let registry: AgentRegistry;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    const storage = new FilesystemStorage(join(testDir, '.oriri'));
    registry = new AgentRegistry(storage);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should print "No active agents." when empty', async () => {
    await agentListCommand(registry);
    expect(consoleSpy).toHaveBeenCalledWith('No active agents.');
  });

  it('should print agent details when agents are registered', async () => {
    await registry.register({
      id: 'agent-alpha',
      role: 'AGENT',
      model: 'claude-sonnet-4-6',
      pid: 48291,
      since: '2026-03-15',
    });

    await agentListCommand(registry);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('agent-alpha');
    expect(output).toContain('AGENT');
    expect(output).toContain('claude-sonnet-4-6');
  });
});
