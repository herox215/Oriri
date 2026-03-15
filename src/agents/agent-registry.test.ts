import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { AgentNotFoundError, AgentAlreadyRegisteredError } from '../shared/errors.js';
import { AgentRegistry } from './agent-registry.js';
import type { ActiveAgent } from './agent-types.js';

describe('AgentRegistry', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let registry: AgentRegistry;

  const agent: ActiveAgent = {
    id: 'agent-alpha',
    role: 'CODER',
    model: 'claude-sonnet-4-6',
    pid: 48291,
    since: '2026-03-15',
  };

  const agent2: ActiveAgent = {
    id: 'agent-reviewer',
    role: 'REVIEWER',
    model: 'claude-haiku-4-5',
    pid: 48305,
    since: '2026-03-15',
  };

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    registry = new AgentRegistry(storage);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('register', () => {
    it('should add an agent to active.md', async () => {
      await registry.register(agent);
      const agents = await registry.listAgents();
      expect(agents).toEqual([agent]);
    });

    it('should allow registering multiple agents', async () => {
      await registry.register(agent);
      await registry.register(agent2);
      const agents = await registry.listAgents();
      expect(agents).toEqual([agent, agent2]);
    });

    it('should throw AgentAlreadyRegisteredError for duplicate ID', async () => {
      await registry.register(agent);
      await expect(registry.register(agent)).rejects.toThrow(AgentAlreadyRegisteredError);
    });
  });

  describe('deregister', () => {
    it('should remove an agent from active.md', async () => {
      await registry.register(agent);
      await registry.register(agent2);
      await registry.deregister(agent.id);
      const agents = await registry.listAgents();
      expect(agents).toEqual([agent2]);
    });

    it('should throw AgentNotFoundError for non-existent agent', async () => {
      await expect(registry.deregister('agent-ghost')).rejects.toThrow(AgentNotFoundError);
    });
  });

  describe('isRegistered', () => {
    it('should return true for registered agent', async () => {
      await registry.register(agent);
      expect(await registry.isRegistered(agent.id)).toBe(true);
    });

    it('should return false for non-registered agent', async () => {
      expect(await registry.isRegistered('agent-ghost')).toBe(false);
    });
  });

  describe('listAgents', () => {
    it('should return empty array when no agents are registered', async () => {
      const agents = await registry.listAgents();
      expect(agents).toEqual([]);
    });
  });

  describe('clearAll', () => {
    it('should remove all agents', async () => {
      await registry.register(agent);
      await registry.register(agent2);
      await registry.clearAll();
      const agents = await registry.listAgents();
      expect(agents).toEqual([]);
    });
  });
});
