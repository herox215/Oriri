import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../cli/init.js';
import { FilesystemStorage } from '../storage/filesystem-storage.js';
import { StoryArchiver, ARCHIVE_THRESHOLD, RETAIN_COUNT } from './story-archiver.js';

function makeEntry(index: number): string {
  const ts = `2025-01-01 00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`;
  return `[${ts}] agent-test | entry ${String(index)}`;
}

async function appendEntries(storage: FilesystemStorage, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await storage.appendStory(makeEntry(i));
  }
}

describe('StoryArchiver', () => {
  let testDir: string;
  let storage: FilesystemStorage;
  let archiver: StoryArchiver;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'oriri-test-'));
    await initCommand({ force: false, cwd: testDir });
    storage = new FilesystemStorage(join(testDir, '.oriri'));
    archiver = new StoryArchiver({ storage });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('needsArchiving', () => {
    it('should return false when story.md has fewer than threshold lines', async () => {
      await appendEntries(storage, 10);
      expect(await archiver.needsArchiving()).toBe(false);
    });

    it('should return true when story.md exceeds threshold lines', async () => {
      await appendEntries(storage, ARCHIVE_THRESHOLD + 10);
      expect(await archiver.needsArchiving()).toBe(true);
    });
  });

  describe('archive', () => {
    it('should return null when under threshold', async () => {
      await appendEntries(storage, 10);
      const result = await archiver.archive('agent-test');
      expect(result).toBeNull();
    });

    it('should move older entries to story.archive.md', async () => {
      const entryCount = ARCHIVE_THRESHOLD + 50;
      await appendEntries(storage, entryCount);

      await archiver.archive('agent-test');

      const archive = await storage.readStoryArchive();
      expect(archive).toContain('entry 0');
      expect(archive).toContain('entry 1');
      // First entries should be archived
      const expectedArchiveCount = entryCount - RETAIN_COUNT;
      expect(archive).toContain(`entry ${String(expectedArchiveCount - 1)}`);
    });

    it('should retain last N entries in story.md', async () => {
      const entryCount = ARCHIVE_THRESHOLD + 50;
      await appendEntries(storage, entryCount);

      await archiver.archive('agent-test');

      const story = await storage.readStory();
      // Last entries should remain
      expect(story).toContain(`entry ${String(entryCount - 1)}`);
      expect(story).toContain(`entry ${String(entryCount - RETAIN_COUNT)}`);
      // First entries should be gone
      expect(story).not.toContain('entry 0 ');
      expect(story).not.toContain('| entry 0');
    });

    it('should insert archive reference comment in story.md', async () => {
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);

      await archiver.archive('agent-test');

      const story = await storage.readStory();
      expect(story).toMatch(/<!-- Archived: entries before .+ moved to story\.archive\.md -->/);
    });

    it('should preserve the story.md header', async () => {
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);

      await archiver.archive('agent-test');

      const story = await storage.readStory();
      expect(story).toContain('# Story');
    });

    it('should create A2A task with type story_archive', async () => {
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);

      const a2aId = await archiver.archive('agent-test');
      expect(a2aId).toBeTruthy();

      const a2aMd = await storage.readA2A(a2aId as string);
      expect(a2aMd).toContain('| type | story_archive |');
      expect(a2aMd).toContain('| status | open |');
      expect(a2aMd).toContain('| created_by | agent-test |');
    });

    it('should deduplicate — return existing A2A ID if open task exists', async () => {
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);

      const firstId = await archiver.archive('agent-test');
      expect(firstId).toBeTruthy();

      // Add more entries to trigger again
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);

      const secondId = await archiver.archive('agent-test');
      expect(secondId).toBe(firstId);
    });

    it('should return A2A ID', async () => {
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);

      const a2aId = await archiver.archive('agent-test');
      expect(a2aId).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should support append-only archive — second archive appends', async () => {
      // First archive
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);
      const firstId = await archiver.archive('agent-test');

      // Resolve the first A2A task so dedup doesn't kick in
      const a2aMd = await storage.readA2A(firstId as string);
      await storage.writeA2A(
        firstId as string,
        a2aMd.replace('| status | open |', '| status | resolved |'),
      );

      // Add more entries and archive again
      await appendEntries(storage, ARCHIVE_THRESHOLD + 50);
      const secondId = await archiver.archive('agent-test');

      expect(secondId).toBeTruthy();
      expect(secondId).not.toBe(firstId);

      const archive = await storage.readStoryArchive();
      // Both archive sections should exist
      const archiveSections = archive.match(/## Archive /g);
      expect(archiveSections).toHaveLength(2);
    });
  });
});
