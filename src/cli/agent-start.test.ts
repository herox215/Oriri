import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from './init.js';
import { ProviderNotFoundError } from '../shared/errors.js';

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

  it('should throw ProviderNotFoundError for unknown provider', async () => {
    await expect(agentStartCommand({ providerName: 'nonexistent', cwd: testDir })).rejects.toThrow(
      ProviderNotFoundError,
    );
  });

  it('should start agent when provider config is valid', async () => {
    const configPath = join(testDir, '.oriri', 'config.yaml');
    await writeFile(
      configPath,
      `mode: local
provider:
  - name: mistral
    model: mistral-large-latest
    key: test-key-123
`,
    );

    await agentStartCommand({ providerName: 'mistral', cwd: testDir });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('started'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('provider: mistral'));
  });
});
