import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from './init.js';
import { AgentConfigNotFoundError } from '../shared/errors.js';

// Mock the agent runner so we don't actually start an LLM loop
vi.mock('../agents/agent-runner.js', () => ({
  AgentRunner: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock the LLM provider factory
vi.mock('../llm/create-llm-provider.js', () => ({
  createLLMProvider: vi.fn().mockReturnValue({
    createMessage: vi.fn(),
  }),
}));

// Mock graceful shutdown
vi.mock('../agents/agent-lifecycle.js', () => ({
  setupGracefulShutdown: vi.fn().mockReturnValue({
    isShutdownRequested: () => false,
    onShutdown: vi.fn(),
  }),
}));

import { agentStartCommand } from './agent-start.js';

describe('agentStartCommand', () => {
  let testDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-start-test-'));
    await initCommand({ force: false, cwd: testDir });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should throw AgentConfigNotFoundError for unknown agent', async () => {
    await expect(agentStartCommand({ agentId: 'nonexistent', cwd: testDir })).rejects.toThrow(
      AgentConfigNotFoundError,
    );
  });

  it('should throw when agent has no api_key', async () => {
    const configPath = join(testDir, '.oriri', 'config.yaml');
    await writeFile(
      configPath,
      `mode: local
agents:
  - id: agent-alpha
    display_name: "Alpha"
    model: claude-sonnet-4-6
    role: AGENT
`,
    );

    await expect(agentStartCommand({ agentId: 'agent-alpha', cwd: testDir })).rejects.toThrow(
      AgentConfigNotFoundError,
    );
  });

  it('should start agent when config is valid', async () => {
    const configPath = join(testDir, '.oriri', 'config.yaml');
    await writeFile(
      configPath,
      `mode: local
agents:
  - id: agent-alpha
    display_name: "Alpha"
    model: claude-sonnet-4-6
    role: AGENT
    api_key: test-key-123
`,
    );

    await agentStartCommand({ agentId: 'agent-alpha', cwd: testDir });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Agent "agent-alpha" started'));
  });
});
