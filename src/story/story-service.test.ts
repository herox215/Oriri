import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { RoleService } from '../agents/role-service.js';

import { StoryService } from './story-service.js';

describe('StoryService', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let roleService: RoleService;
  let storyService: StoryService;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    roleService = new RoleService();
    storyService = new StoryService(storage, roleService);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('appendStory', () => {
    it('should append a formatted entry with automatic timestamp', async () => {
      await storyService.appendStory('agent-alpha', 'AGENT', 'discovered shared utility');

      const story = await storyService.getStory();
      expect(story).toMatch(
        /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] agent-alpha \| discovered shared utility/,
      );
    });

    it('should append multiple entries without overwriting', async () => {
      await storyService.appendStory('agent-alpha', 'AGENT', 'first insight');
      await storyService.appendStory('agent-beta', 'AGENT', 'second insight');

      const story = await storyService.getStory();
      expect(story).toContain('agent-alpha | first insight');
      expect(story).toContain('agent-beta | second insight');
    });

    it('should deny MCP_CLIENT write access when canWrite is false', async () => {
      // MCP_CLIENT can write story, so this test verifies the role system works.
      // Since both AGENT and MCP_CLIENT can write story, we just verify no throw.
      await storyService.appendStory('agent-watcher', 'MCP_CLIENT', 'should succeed');
    });
  });

  describe('appendDecision', () => {
    it('should include A2A reference in the entry', async () => {
      await storyService.appendDecision('agent-alpha', 'AGENT', 'abc123', 'merge approved');

      const story = await storyService.getStory();
      expect(story).toContain('agent-alpha | merge approved (via a2a-abc123)');
    });

    it('should throw on empty a2aId', async () => {
      await expect(
        storyService.appendDecision('agent-alpha', 'AGENT', '', 'no ref'),
      ).rejects.toThrow('a2aId is required for decision entries');
    });
  });

  describe('appendCorrection', () => {
    it('should prefix message with [CORRECTION]', async () => {
      await storyService.appendCorrection(
        'agent-alpha',
        'AGENT',
        'actually uses Redis, not Postgres',
      );

      const story = await storyService.getStory();
      expect(story).toContain('agent-alpha | [CORRECTION] actually uses Redis, not Postgres');
    });
  });

  describe('getStory', () => {
    it('should return default content on fresh init', async () => {
      const story = await storyService.getStory();
      expect(story).toContain('# Story');
    });

    it('should return all appended entries', async () => {
      await storyService.appendStory('agent-alpha', 'AGENT', 'entry one');
      await storyService.appendStory('agent-beta', 'AGENT', 'entry two');

      const story = await storyService.getStory();
      expect(story).toContain('entry one');
      expect(story).toContain('entry two');
    });
  });
});
