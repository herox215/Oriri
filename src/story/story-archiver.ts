import type { StorageInterface } from '../storage/storage-interface.js';
import {
  buildA2AMarkdown,
  extractA2AStatusFromMarkdown,
  extractA2ATypeFromMarkdown,
} from '../a2a/a2a-markdown.js';
import { generateA2AId } from '../a2a/a2a-id.js';
import { StoryArchiveError } from '../shared/errors.js';

export const ARCHIVE_THRESHOLD = 200;
export const RETAIN_COUNT = 50;

export interface StoryArchiverDeps {
  storage: StorageInterface;
}

export class StoryArchiver {
  constructor(private readonly deps: StoryArchiverDeps) {}

  async needsArchiving(): Promise<boolean> {
    const content = await this.deps.storage.readStory();
    const lines = content.split('\n');
    return lines.length > ARCHIVE_THRESHOLD;
  }

  async archive(triggeringAgentId: string): Promise<string | null> {
    const { storage } = this.deps;

    const content = await storage.readStory();
    const lines = content.split('\n');

    if (lines.length <= ARCHIVE_THRESHOLD) {
      return null;
    }

    // Separate header from entries
    const { header, entries } = this.splitHeaderAndEntries(lines);

    if (entries.length === 0) {
      return null;
    }

    // Split entries into archive and retain
    const retainStart = Math.max(0, entries.length - RETAIN_COUNT);
    const toArchive = entries.slice(0, retainStart);
    const toRetain = entries.slice(retainStart);

    if (toArchive.length === 0) {
      return null;
    }

    // Check for existing open story_archive A2A task
    const existingA2AIds = await storage.listA2A();
    for (const a2aId of existingA2AIds) {
      try {
        const a2aMd = await storage.readA2A(a2aId);
        const a2aStatus = extractA2AStatusFromMarkdown(a2aMd);
        const a2aType = extractA2ATypeFromMarkdown(a2aMd);
        if (a2aStatus === 'open' && a2aType === 'story_archive') {
          return a2aId;
        }
      } catch {
        continue;
      }
    }

    // Create A2A task
    const a2aId = generateA2AId(triggeringAgentId, 'story_archive', existingA2AIds);
    const a2aMarkdown = buildA2AMarkdown({
      id: a2aId,
      type: 'story_archive',
      status: 'open',
      createdBy: triggeringAgentId,
      createdAt: new Date().toISOString(),
      description: `story.md exceeded ${String(ARCHIVE_THRESHOLD)} lines. Archiving ${String(toArchive.length)} entries to story.archive.md, retaining last ${String(toRetain.length)} entries.`,
    });
    await storage.writeA2A(a2aId, a2aMarkdown);

    // TODO (T-014): Gate the following behind A2A consent once voting is implemented

    // Append archived entries to story.archive.md
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const archiveSection = `\n## Archive ${timestamp}\n\n${toArchive.join('\n')}\n`;

    try {
      await storage.appendStoryArchive(archiveSection);
    } catch {
      throw new StoryArchiveError('Failed to append to story.archive.md');
    }

    // Rewrite story.md with header + archive reference + retained entries
    const archiveRef = `<!-- Archived: entries before ${timestamp} moved to story.archive.md -->`;
    const newStoryContent = [...header, archiveRef, ...toRetain, ''].join('\n');

    try {
      await storage.writeStory(newStoryContent);
    } catch {
      throw new StoryArchiveError('Failed to rewrite story.md after archiving');
    }

    return a2aId;
  }

  private splitHeaderAndEntries(lines: string[]): { header: string[]; entries: string[] } {
    const header: string[] = [];
    let entryStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      if (/^\[\d{4}-\d{2}-\d{2}/.test(line)) {
        entryStart = i;
        break;
      }
      header.push(line);
      entryStart = i + 1;
    }

    const entries = lines.slice(entryStart).filter((line) => line.length > 0);
    return { header, entries };
  }
}
